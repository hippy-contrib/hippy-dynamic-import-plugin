/*
	MIT License http://www.opensource.org/licenses/mit-license.php
  modify base on https://github.com/webpack/webpack/blob/v5.36.2/lib/runtime/LoadScriptRuntimeModule.js
  make change to support load script in hippy
*/

"use strict";

const { SyncWaterfallHook } = require("tapable");
const Compilation = require("webpack/lib/Compilation");
const RuntimeGlobals = require("webpack/lib/RuntimeGlobals");
const Template = require("webpack/lib/Template");
const HelperRuntimeModule = require("webpack/lib/runtime/HelperRuntimeModule");

/** @typedef {import("../Chunk")} Chunk */
/** @typedef {import("../Compiler")} Compiler */

/**
 * @typedef {Object} LoadScriptCompilationHooks
 * @property {SyncWaterfallHook<[string, Chunk]>} createScript
 */

/** @type {WeakMap<Compilation, LoadScriptCompilationHooks>} */
const compilationHooksMap = new WeakMap();

class LoadScriptRuntimeModule extends HelperRuntimeModule {
	/**
	 * @param {Compilation} compilation the compilation
	 * @returns {LoadScriptCompilationHooks} hooks
	 */
	static getCompilationHooks(compilation) {
		if (!(compilation instanceof Compilation)) {
			throw new TypeError(
				"The 'compilation' argument must be an instance of Compilation"
			);
		}
		let hooks = compilationHooksMap.get(compilation);
		if (hooks === undefined) {
			hooks = {
				createScript: new SyncWaterfallHook(["source", "chunk"])
			};
			compilationHooksMap.set(compilation, hooks);
		}
		return hooks;
	}

	constructor() {
		super("load script for hippy");
	}

	/**
	 * @returns {string} runtime code
	 */
	generate() {
		const { compilation } = this;
		const { runtimeTemplate, outputOptions } = compilation;
		const fn = RuntimeGlobals.loadScript;
		return Template.asString([
			"// loadScript function to load a script via script tag",
			`${fn} = ${runtimeTemplate.basicFunction("url, done, key, chunkId", [
				"global.dynamicLoad(url, done)",
			])};`
		]);
	}
}

module.exports = LoadScriptRuntimeModule;
