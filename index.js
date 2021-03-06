const Template = require('webpack/lib/Template');
const UnsupportedFeatureWarning = require('webpack/lib/UnsupportedFeatureWarning');

class HippyDynamicLoadPlugin {
  // eslint-disable-next-line class-methods-use-this
  apply(compiler) {
    compiler.hooks.compilation.tap(
        'CustomImportParserPlugin',
        (compilation, { normalModuleFactory }) => {
          const handler = (parser, parserOptions) => {
            if (parserOptions.import !== undefined && !parserOptions.import) return;
            parser.hooks.importCall.tap('CustomImportParserPlugin', (expr) => {
              if (expr.arguments.length !== 1) {
                throw new Error(
                    "Incorrect number of arguments provided to 'import(module: string) -> Promise'.",
                );
              }
              const param = parser.evaluateExpression(expr.arguments[0]);
              //
              let chunkName = null;
              let mode = 'lazy';

              const {
                options: importOptions,
              } = parser.parseCommentOptions(expr.range);

              if (importOptions) {
                if (importOptions.webpackChunkName !== undefined) {
                  if (typeof importOptions.webpackChunkName !== 'string') {
                    parser.state.module.warnings.push(
                        new UnsupportedFeatureWarning(
                            parser.state.module,
                            `\`webpackChunkName\` expected a string, but received: ${importOptions.webpackChunkName}.`,
                            expr.loc,
                        ),
                    );
                  } else {
                    chunkName = importOptions.webpackChunkName;
                  }
                }
                if (importOptions.webpackMode !== undefined) {
                  if (typeof importOptions.webpackMode !== 'string') {
                    parser.state.module.warnings.push(
                        new UnsupportedFeatureWarning(
                            parser.state.module,
                            `\`webpackMode\` expected a string, but received: ${importOptions.webpackMode}.`,
                            expr.loc,
                        ),
                    );
                  } else {
                    mode = importOptions.webpackMode;
                  }
                }
              }

              if (param.isString()) {
                if (mode !== 'lazy' && mode !== 'eager' && mode !== 'weak') {
                  parser.state.module.warnings.push(
                      new UnsupportedFeatureWarning(
                          parser.state.module,
                          `\`webpackMode\` expected 'lazy', 'eager' or 'weak', but received: ${mode}.`,
                          expr.loc,
                      ),
                  );
                }

                if (!['eager', 'weak'].includes(mode) && chunkName) {
                  // eslint-disable-next-line no-underscore-dangle
                  if (!global.__DYNAMIC_LOAD_MAP__) {
                    // eslint-disable-next-line no-underscore-dangle
                    global.__DYNAMIC_LOAD_MAP__ = {
                      [chunkName]: importOptions.customChunkPath,
                    };
                  } else {
                    // eslint-disable-next-line no-underscore-dangle
                    Object.assign(global.__DYNAMIC_LOAD_MAP__, {
                      [chunkName]: importOptions.customChunkPath,
                    });
                  }
                }
              }
            });
          };

          normalModuleFactory.hooks.parser
          .for('javascript/auto')
          .tap('ImportPlugin', handler);
          normalModuleFactory.hooks.parser
          .for('javascript/dynamic')
          .tap('ImportPlugin', handler);
          normalModuleFactory.hooks.parser
          .for('javascript/esm')
          .tap('ImportPlugin', handler);
        },
    );

    compiler.hooks.make.tapAsync('HippyDynamicLoadPlugin', (compilation, callback) => {
      const tapsOfRequireEnsuer = compilation.mainTemplate.hooks.requireEnsure.taps;
      for (let i = 0; i < tapsOfRequireEnsuer.length; i += 1) {
        if (tapsOfRequireEnsuer[i].name === 'JsonpMainTemplatePlugin load') {
          tapsOfRequireEnsuer.splice(i, 1);
          compilation.mainTemplate.hooks.requireEnsure.tap(
              'JsonpMainTemplatePlugin load',
              source => {
                //   const chunkLoadTimeout = compilation.mainTemplate.outputOptions.chunkLoadTimeout;
                return Template.asString([source,
                  '',
                  '// JSONP chunk loading for javascript',
                  '',
                  'var installedChunkData = installedChunks[chunkId];',
                  'if(installedChunkData !== 0) { // 0 means "already installed".',
                  Template.indent(['',
                    '// a Promise means "currently loading".',
                    'if(installedChunkData) {',
                    Template.indent(['promises.push(installedChunkData[2]);']),
                    '} else {',
                    Template.indent([
                      '// setup Promise in chunk cache',
                      'var promise = new Promise(function(resolve, reject) {',
                      Template.indent([
                        'installedChunkData = installedChunks[chunkId] = [resolve, reject];'
                      ]),
                      '});',
                      'promises.push(installedChunkData[2] = promise);',
                      '',
                      '// start chunk loading',
                      global.__DYNAMIC_LOAD_MAP__
                      ? `if(!global.__DYNAMIC_LOAD_MAP__) {
                            try {
                              global.__DYNAMIC_LOAD_MAP__ = JSON.parse('${JSON.stringify(global.__DYNAMIC_LOAD_MAP__)}');
                            } catch(err) {
                              console.error('parse __DYNAMIC_LOAD_MAP__ error', err)
                       }}` : "",
                      `var path = jsonpScriptSrc(chunkId);
                       if (path && global.__DYNAMIC_LOAD_MAP__) {
                          var isSchema = ['https://', 'http://', '//'].some(schema => path.indexOf(schema) === 0);
                          if(isSchema) {
                            var pathList = path.split('/');
                            var chunkAllName = pathList[pathList.length -1];
                            var chunkName = chunkAllName.split('.')[0];
                            var customChunkPath = global.__DYNAMIC_LOAD_MAP__[chunkName];
                            if(customChunkPath) path = customChunkPath + chunkAllName;
                            } else {
                              var chunkName = path.split('.')[0];
                              var customChunkPath = global.__DYNAMIC_LOAD_MAP__[chunkName];
                              if(customChunkPath) path = customChunkPath + path;
                            }
                          }`,
                      'onScriptComplete = function (error) {',
                      Template.indent([
                        'if(error) {',
                        Template.indent([
                          'error.name = "ChunkLoadError";',
                          'chunk[1](error);',
                          'installedChunks[chunkId] = undefined;',
                        ]),
                        '}',
                      ]),
                      '};',
                      'global.dynamicLoad(path, onScriptComplete);',
                    ]),
                    '}',
                  ]),
                  '}',
                ])
              },
          );
          break;
        }
      }
      callback(null, compilation);
    });
  }
}

module.exports = HippyDynamicLoadPlugin;