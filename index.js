const Template = require('webpack/lib/Template');
const UnsupportedFeatureWarning = require('webpack/lib/UnsupportedFeatureWarning');

class HippyDynamicLoadPlugin {
  apply(compiler) {
    if (getWebpackVersion(compiler) === '4') {
      this.applyV4(compiler);
    } else if (getWebpackVersion(compiler) === '5') {
      this.applyV5(compiler);
    }
  }

  applyV4(compiler) {
    this.hookDynamicLoadExpression(compiler);

    compiler.hooks.make.tapAsync('HippyDynamicLoadPlugin', (compilation, callback) => {
      const tapsOfRequireEnsuer = compilation.mainTemplate.hooks.requireEnsure.taps;
      for (let i = 0; i < tapsOfRequireEnsuer.length; i += 1) {
        if (tapsOfRequireEnsuer[i].name === 'JsonpMainTemplatePlugin load') {
          tapsOfRequireEnsuer.splice(i, 1);
          compilation.mainTemplate.hooks.requireEnsure.tap(
            'JsonpMainTemplatePlugin load',
            source =>
              // const chunkLoadTimeout = compilation.mainTemplate.outputOptions.chunkLoadTimeout;
              Template.asString([source,
                '',
                '// JSONP chunk loading for javascript',
                '',
                'var installedChunkData = installedChunks[chunkId];',
                'if(installedChunkData !== 0) { // 0 means "already installed".',
                Template.indent([
                  '// a Promise means "currently loading".',
                  'if(installedChunkData) {',
                  Template.indent(['promises.push(installedChunkData[2]);']),
                  '} else {',
                  Template.indent([
                    '// setup Promise in chunk cache',
                    'var promise = new Promise(function(resolve, reject) {',
                    Template.indent([
                      'installedChunkData = installedChunks[chunkId] = [resolve, reject];',
                    ]),
                    '});',
                    'promises.push(installedChunkData[2] = promise);',
                    '// start chunk loading',
                    global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__
                      ? `if(!global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__) {${
                        Template.indent([
                          'try {',
                          Template.indent([
                            `var stringifiedMap = JSON.parse('${JSON.stringify(global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__)}');`,
                            'global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__ = stringifiedMap;',
                          ]),
                          '} catch(err) {',
                          Template.indent(['console.error(\'parse __DYNAMIC_LOAD_CUSTOM_PATH_MAP__ error\', err);']),
                          '}',
                        ])
                      }}` : '',
                    'var path = jsonpScriptSrc(chunkId);',
                    'if (path && global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__) {',
                    Template.indent([
                      'var isSchema = [\'https://\', \'http://\', \'//\'].some(schema => path.indexOf(schema) === 0);',
                      'if(isSchema) {',
                      Template.indent([
                        'var pathList = path.split(\'/\');',
                        'var chunkAllName = pathList[pathList.length -1];',
                        'var chunkName = chunkAllName.split(\'.\')[0];',
                        'var customChunkPath = global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__[chunkName];',
                        'if(customChunkPath) path = customChunkPath + chunkAllName;',
                      ]),
                      '} else {',
                      Template.indent([
                        'var chunkName = path.split(\'.\')[0];',
                        ' var customChunkPath = global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__[chunkName];',
                        'if(customChunkPath) path = customChunkPath + path;',
                      ]),
                      '}',
                    ]),
                    '}',
                    'onScriptComplete = function (error) {',
                    Template.indent([
                      'if(error instanceof Error) {',
                      Template.indent([
                        'error.message += \', load chunk \' + chunkId + \' failed, path is \' + path;',
                        'var chunk = installedChunks[chunkId];',
                        'chunk !== 0 && chunk && chunk[1](error);',
                        'installedChunks[chunkId] = undefined;',
                      ]),
                      '}',
                    ]),
                    '}',
                    'global.dynamicLoad(path, onScriptComplete);',
                  ]),
                  '}',
                ]),
                '}',
              ])
            ,
          );
          break;
        }
      }
      callback(null, compilation);
    });
  }

  applyV5(compiler) {
    this.hookDynamicLoadExpression(compiler);
    const RuntimeGlobals = require('webpack/lib/RuntimeGlobals');
    const LoadScriptRuntimeModule = require('./LoadScriptRuntimeModule');
    const JsonpChunkLoadingRuntimeModule = require('./JsonpChunkLoadingRuntimeModule');
    compiler.hooks.compilation.tap(
      HippyDynamicLoadPlugin.name,
      (compilation) => {
        // inject __webpack_require__.l
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.loadScript)
          .tap({
            name: HippyDynamicLoadPlugin.name,
            // set min stage and return true to inject in SyncBailHook
            stage: -Infinity,
            // eslint-disable-next-line no-unused-vars
          }, (chunk, set) => {
            compilation.addRuntimeModule(chunk, new LoadScriptRuntimeModule());
            return true;
          });

        // inject __webpack_require__.f.j, which is used for load sub bundle
        const globalChunkLoading = compilation.outputOptions.chunkLoading;
        const isEnabledForChunk = (chunk) => {
          const options = chunk.getEntryOptions();
          const chunkLoading =              options && options.chunkLoading !== undefined
            ? options.chunkLoading
            : globalChunkLoading;
          return chunkLoading === 'jsonp';
        };
        const onceForChunkSet = new WeakSet();
        const handler = (chunk, set) => {
          if (onceForChunkSet.has(chunk)) return;
          onceForChunkSet.add(chunk);
          if (!isEnabledForChunk(chunk)) return;
          set.add(RuntimeGlobals.moduleFactoriesAddOnly);
          set.add(RuntimeGlobals.hasOwnProperty);
          compilation.addRuntimeModule(
            chunk,
            new JsonpChunkLoadingRuntimeModule(set),
          );
          return true;
        };
        compilation.hooks.runtimeRequirementInTree
          .for(RuntimeGlobals.ensureChunkHandlers)
          .tap({
            name: HippyDynamicLoadPlugin.name,
            // set max stage to inject after official implement
            stage: Infinity,
          }, handler);
      },
    );
  }

  hookDynamicLoadExpression(compiler) {
    compiler.hooks.compilation.tap(
      'CustomImportParserPlugin',
      (compilation, { normalModuleFactory }) => {
        const handler = (parser, parserOptions) => {
          if (parserOptions.import !== undefined && !parserOptions.import) return;
          parser.hooks.importCall.tap('CustomImportParserPlugin', (expr) => {
            let param;
            if (getWebpackVersion(compiler) === '4') {
              if (expr.arguments.length !== 1) {
                throw new Error('Incorrect number of arguments provided to \'import(module: string) -> Promise\'.');
              }
              param = parser.evaluateExpression(expr.arguments[0]);
            } else if (getWebpackVersion(compiler) === '5') {
              param = parser.evaluateExpression(expr.source);
            }

            let chunkName = null;
            let mode = 'lazy';

            const {
              options: importOptions,
            } = parser.parseCommentOptions(expr.range);

            if (importOptions) {
              if (importOptions.webpackChunkName !== undefined) {
                if (typeof importOptions.webpackChunkName !== 'string') {
                  parser.state.module.warnings.push(new UnsupportedFeatureWarning(
                    parser.state.module,
                    `\`webpackChunkName\` expected a string, but received: ${importOptions.webpackChunkName}.`,
                    expr.loc,
                  ));
                } else {
                  chunkName = importOptions.webpackChunkName;
                }
              }
              if (importOptions.webpackMode !== undefined) {
                if (typeof importOptions.webpackMode !== 'string') {
                  parser.state.module.warnings.push(new UnsupportedFeatureWarning(
                    parser.state.module,
                    `\`webpackMode\` expected a string, but received: ${importOptions.webpackMode}.`,
                    expr.loc,
                  ));
                } else {
                  mode = importOptions.webpackMode;
                }
              }
            }

            if (param.isString()) {
              if (mode !== 'lazy' && mode !== 'eager' && mode !== 'weak') {
                parser.state.module.warnings.push(new UnsupportedFeatureWarning(
                  parser.state.module,
                  `\`webpackMode\` expected 'lazy', 'eager' or 'weak', but received: ${mode}.`,
                  expr.loc,
                ));
              }

              if (!['eager', 'weak'].includes(mode) && chunkName) {
                // eslint-disable-next-line no-underscore-dangle
                /**
                 * __DYNAMIC_LOAD_CUSTOM_PATH_MAP__
                 * it stores all custom chunk paths
                 */
                if (!global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__) {
                  // eslint-disable-next-line no-underscore-dangle
                  global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__ = {
                    [chunkName]: importOptions.customChunkPath,
                  };
                } else {
                  // eslint-disable-next-line no-underscore-dangle
                  Object.assign(global.__DYNAMIC_LOAD_CUSTOM_PATH_MAP__, {
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
  }
}

// only consider version >=4
function getWebpackVersion(compiler) {
  if (!compiler.webpack) return '4';
  const [version] = compiler.webpack.version.split('.');
  return version;
}

module.exports = HippyDynamicLoadPlugin;
module.exports.HippyDynamicLoadPlugin = HippyDynamicLoadPlugin;
