const Template = require('webpack/lib/Template');

class HippyDynamicLoadPlugin {
  // eslint-disable-next-line class-methods-use-this
  apply(compiler) {
    compiler.hooks.make.tapAsync('HippyDynamicLoadPlugin', (compilation, callback) => {
      const tapsOfRequireEnsuer = compilation.mainTemplate.hooks.requireEnsure.taps;
      for (let i = 0; i < tapsOfRequireEnsuer.length; i += 1) {
        if (tapsOfRequireEnsuer[i].name === 'JsonpMainTemplatePlugin load') {
          tapsOfRequireEnsuer.splice(i, 1);
          compilation.mainTemplate.hooks.requireEnsure.tap(
            'JsonpMainTemplatePlugin load',
            source => (
            //   const chunkLoadTimeout = compilation.mainTemplate.outputOptions.chunkLoadTimeout;
              Template.asString([source,
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
                    'var path = jsonpScriptSrc(chunkId);',
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
            ),
          );
          break;
        }
      }
      callback(null, compilation);
    });
  }
}

module.exports = HippyDynamicLoadPlugin;
