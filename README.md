# hippy-dynamic-import-plugin

hippy webpack 打包动态加载chunk包插件

## 介绍

随着hippy业务越来越复杂，单独打包越来越大。为了减少首包大小，hippy 支持了`import()`进行动态加载分包。详细请参考 [Hippy 动态加载使用说明](https://hippyjs.org/#/guide/dynamic-import)

## 支持版本

本地加载: `hippy version >= 2.2`

http 加载: `hippy version >= 2.5.4`

