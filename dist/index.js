#! /usr/bin/env node
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getContent = exports.getContentFromUrl = exports.isObject = exports.getContentFromFile = exports.distFile = exports.isUrl = exports.writeToFile = exports.generator = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _commander = require("commander");

var _commander2 = _interopRequireDefault(_commander);

var _prettier = require("prettier");

var _prettier2 = _interopRequireDefault(_prettier);

var _jsYaml = require("js-yaml");

var _jsYaml2 = _interopRequireDefault(_jsYaml);

var _fs = require("fs");

var _fs2 = _interopRequireDefault(_fs);

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

var _axios = require("axios");

var _axios2 = _interopRequireDefault(_axios);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// Swagger data types are base on types supported by the JSON-Scheme Draft4.
var typeMapping = {
  array: "Array<*>",
  boolean: "boolean",
  integer: "number",
  number: "number",
  null: "null",
  object: "Object",
  Object: "Object",
  string: "string",
  enum: "string"
};

var definitionTypeName = function definitionTypeName(ref) {
  var re = /#\/definitions\/(.*)|#\/components\/schemas\/(.*)/;
  var found = ref.match(re);
  if (!found) {
    return "";
  }
  return found[1].replace("-", "").replace('.', '') || found[2].replace("-", "").replace('.', '');
};

var stripBrackets = function stripBrackets(name) {
  return name.replace(/[[\]']+/g, "");
};

var typeFor = function typeFor(property) {
  if (property.type === "array") {
    if ("oneOf" in property.items) {
      return "Array<" + property.items.oneOf.map(function (e) {
        return e.type === "object" ? propertiesTemplate(propertiesList(e.items)).replace(/"/g, "") : typeFor(e);
      }).join(" | ") + ">";
    } else if ("$ref" in property.items) {
      return "Array<" + definitionTypeName(property.items.$ref) + ">";
    } else if (property.items.type === "object") {
      var child = propertiesTemplate(propertiesList(property.items)).replace(/"/g, "");
      return "Array<" + child + ">";
    }
    return "Array<" + typeMapping[property.items.type] + ">";
  } else if (property.type === "string" && "enum" in property) {
    return property.enum.map(function (e) {
      return "'" + e + "'";
    }).join(" | ");
  } else if (Array.isArray(property.type)) {
    return property.type.map(function (t) {
      return typeMapping[t];
    }).join(" | ");
  } else if (property.type === "object") {
    return propertiesTemplate(propertiesList(property)).replace(/"/g, "");
  }
  if ("allOf" in property) {
    return property.allOf.map(function (p) {
      return typeFor(p);
    }).join("&");
  }
  return typeMapping[property.type] || definitionTypeName(property.$ref);
};

var isRequired = function isRequired(propertyName, definition) {
  var result = definition.required && definition.required.indexOf(propertyName) >= 0;
  return result;
};

var propertyKeyForDefinition = function propertyKeyForDefinition(propName, definition) {
  var resolvedPropName = propName.indexOf("-") > 0 ? "'" + propName + "'" : propName;
  if (_commander2.default.checkRequired) {
    return "" + resolvedPropName + (isRequired(propName, definition) ? "" : "?");
  }
  return resolvedPropName;
};

var propertiesList = function propertiesList(definition) {
  if ("allOf" in definition) {
    return definition.allOf.map(propertiesList);
  }

  if (definition.$ref) {
    return { $ref: definitionTypeName(definition.$ref).replace("-", "").replace('.', '') };
  }

  if ("type" in definition && definition.type !== "object") {
    return typeFor(definition);
  }

  if (!definition.properties || Object.keys(definition.properties).length === 0) {
    return {};
  }
  return Object.assign.apply(null, Object.keys(definition.properties).reduce(function (properties, propName) {
    var arr = properties.concat(_defineProperty({}, propertyKeyForDefinition(propName, definition), typeFor(definition.properties[propName])));
    return arr;
  }, [{}]));
};

var withExact = function withExact(property) {
  var result = property.replace(/{[^|]/g, "{|").replace(/[^|]}/g, "|}");
  return result;
};

var propertiesTemplate = function propertiesTemplate(properties) {
  if (typeof properties === "string") {
    return properties;
  }
  if (Array.isArray(properties)) {
    return properties.map(function (property) {
      var p = property.$ref ? "& " + property.$ref : JSON.stringify(property);
      if (!property.$ref && _commander2.default.exact) {
        p = withExact(p);
      }
      return p;
    }).sort(function (a) {
      return a[0] === "&" ? 1 : -1;
    }).join(" ");
  }
  if (_commander2.default.exact) {
    return withExact(JSON.stringify(properties));
  }
  return JSON.stringify(properties);
};

var generate = function generate(swagger) {
  var defs = void 0;
  if (swagger.definitions) {
    defs = swagger.definitions;
  } else if (swagger.components) {
    defs = swagger.components.schemas;
  }
  if (!defs) {
    throw new Error("There is no definition");
  }

  var g = Object.keys(defs).reduce(function (acc, definitionName) {
    var arr = acc.concat({
      title: stripBrackets(definitionName),
      properties: propertiesList(defs[definitionName])
    });
    return arr;
  }, []).map(function (definition) {
    var s = "export type " + definition.title.replace("-", "").replace('.', '') + " = " + propertiesTemplate(definition.properties).replace(/"/g, "") + ";";
    return s;
  }).join(" ");
  return g;
};

var generator = exports.generator = function generator(content, file) {
  var options = _prettier2.default.resolveConfig.sync(file) || {};
  var result = "// @flow\n" + generate(content);
  return _prettier2.default.format(result, options);
};

var writeToFile = exports.writeToFile = function writeToFile() {
  var dist = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : "./flowtype.js";
  var result = arguments[1];

  _fs2.default.writeFile(dist, result, function (err) {
    if (err) {
      throw err;
    }
  });
};

var isUrl = exports.isUrl = function isUrl(value) {
  return value.match(/https?:\/\//) !== null;
};

var distFile = exports.distFile = function distFile(p, inputFileName) {
  if (p.destination) {
    return p.destination;
  }
  if (isUrl(inputFileName)) {
    return "./flowtype.js";
  }

  var ext = _path2.default.parse(inputFileName).ext;
  return inputFileName.replace(ext, ".js");
};

var getContentFromFile = exports.getContentFromFile = function getContentFromFile(file) {
  var ext = _path2.default.extname(file);
  var readFile = _fs2.default.readFileSync(file, "utf8");
  return ext === ".yaml" ? _jsYaml2.default.safeLoad(readFile) : JSON.parse(readFile);
};

var isObject = exports.isObject = function isObject(value) {
  return (typeof value === "undefined" ? "undefined" : _typeof(value)) === "object" && value !== null;
};

var getContentFromUrl = exports.getContentFromUrl = function getContentFromUrl(url) {
  return (0, _axios2.default)({
    method: "get",
    url: url
  }).then(function (response) {
    var data = response.data;

    return isObject(data) ? data : _jsYaml2.default.safeLoad(data);
  });
};

var getContent = exports.getContent = function getContent(fileOrUrl) {
  if (isUrl(fileOrUrl)) {
    return getContentFromUrl(fileOrUrl);
  }
  var content = getContentFromFile(fileOrUrl);
  return Promise.resolve(content);
};

_commander2.default.arguments("<file>").option("-d --destination <destination>", "Destination path").option("-cr --check-required", "Add question mark to optional properties").option("-e --exact", "Add exact types").action(async function (file) {
  try {
    var content = await getContent(file);
    var result = generator(content, file);
    var dist = distFile(_commander2.default, file);
    writeToFile(dist, result);
    console.log("Generated flow types to " + dist);
  } catch (e) {
    console.log(e);
  }
}).parse(process.argv);