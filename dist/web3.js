require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file coder.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var BigNumber = require('bignumber.js');
var utils = require('../utils/utils');
var f = require('./formatters');
var SolidityParam = require('./param');

/**
 * Should be used to check if a type is an array type
 *
 * @method isArrayType
 * @param {String} type
 * @return {Bool} true is the type is an array, otherwise false
 */
var isArrayType = function (type) {
    return type.slice(-2) === '[]';
};

/**
 * SolidityType prototype is used to encode/decode solidity params of certain type
 */
var SolidityType = function (config) {
    this._name = config.name;
    this._match = config.match;
    this._mode = config.mode;
    this._inputFormatter = config.inputFormatter;
    this._outputFormatter = config.outputFormatter;
};

/**
 * Should be used to determine if this SolidityType do match given type
 *
 * @method isType
 * @param {String} name
 * @return {Bool} true if type match this SolidityType, otherwise false
 */
SolidityType.prototype.isType = function (name) {
    if (this._match === 'strict') {
        return this._name === name || (name.indexOf(this._name) === 0 && name.slice(this._name.length) === '[]');
    } else if (this._match === 'prefix') {
        // TODO better type detection!
        return name.indexOf(this._name) === 0;
    }
};

/**
 * Should be used to transform plain param to SolidityParam object
 *
 * @method formatInput
 * @param {Object} param - plain object, or an array of objects
 * @param {Bool} arrayType - true if a param should be encoded as an array
 * @return {SolidityParam} encoded param wrapped in SolidityParam object 
 */
SolidityType.prototype.formatInput = function (param, arrayType) {
    if (utils.isArray(param) && arrayType) { // TODO: should fail if this two are not the same
        var self = this;
        return param.map(function (p) {
            return self._inputFormatter(p);
        }).reduce(function (acc, current) {
            return acc.combine(current);
        }, f.formatInputInt(param.length)).withOffset(32);
    } 
    return this._inputFormatter(param);
};

/**
 * Should be used to transoform SolidityParam to plain param
 *
 * @method formatOutput
 * @param {SolidityParam} byteArray
 * @param {Bool} arrayType - true if a param should be decoded as an array
 * @return {Object} plain decoded param
 */
SolidityType.prototype.formatOutput = function (param, arrayType) {
    if (arrayType) {
        // let's assume, that we solidity will never return long arrays :P 
        var result = [];
        var length = new BigNumber(param.dynamicPart().slice(0, 64), 16);
        for (var i = 0; i < length * 64; i += 64) {
            result.push(this._outputFormatter(new SolidityParam(param.dynamicPart().substr(i + 64, 64))));
        }
        return result;
    }
    return this._outputFormatter(param);
};

/**
 * Should be used to slice single param from bytes
 *
 * @method sliceParam
 * @param {String} bytes
 * @param {Number} index of param to slice
 * @param {String} type
 * @returns {SolidityParam} param
 */
SolidityType.prototype.sliceParam = function (bytes, index, type) {
    if (this._mode === 'bytes') {
        return SolidityParam.decodeBytes(bytes, index);
    } else if (isArrayType(type)) {
        return SolidityParam.decodeArray(bytes, index);
    }
    return SolidityParam.decodeParam(bytes, index);
};

/**
 * SolidityCoder prototype should be used to encode/decode solidity params of any type
 */
var SolidityCoder = function (types) {
    this._types = types;
};

/**
 * This method should be used to transform type to SolidityType
 *
 * @method _requireType
 * @param {String} type
 * @returns {SolidityType} 
 * @throws {Error} throws if no matching type is found
 */
SolidityCoder.prototype._requireType = function (type) {
    var solidityType = this._types.filter(function (t) {
        return t.isType(type);
    })[0];

    if (!solidityType) {
        throw Error('invalid solidity type!: ' + type);
    }

    return solidityType;
};

/**
 * Should be used to transform plain param of given type to SolidityParam
 *
 * @method _formatInput
 * @param {String} type of param
 * @param {Object} plain param
 * @return {SolidityParam}
 */
SolidityCoder.prototype._formatInput = function (type, param) {
    return this._requireType(type).formatInput(param, isArrayType(type));
};

/**
 * Should be used to encode plain param
 *
 * @method encodeParam
 * @param {String} type
 * @param {Object} plain param
 * @return {String} encoded plain param
 */
SolidityCoder.prototype.encodeParam = function (type, param) {
    return this._formatInput(type, param).encode();
};

/**
 * Should be used to encode list of params
 *
 * @method encodeParams
 * @param {Array} types
 * @param {Array} params
 * @return {String} encoded list of params
 */
SolidityCoder.prototype.encodeParams = function (types, params) {
    var self = this;
    var solidityParams = types.map(function (type, index) {
        return self._formatInput(type, params[index]);
    });

    return SolidityParam.encodeList(solidityParams);
};

/**
 * Should be used to decode bytes to plain param
 *
 * @method decodeParam
 * @param {String} type
 * @param {String} bytes
 * @return {Object} plain param
 */
SolidityCoder.prototype.decodeParam = function (type, bytes) {
    return this.decodeParams([type], bytes)[0];
};

/**
 * Should be used to decode list of params
 *
 * @method decodeParam
 * @param {Array} types
 * @param {String} bytes
 * @return {Array} array of plain params
 */
SolidityCoder.prototype.decodeParams = function (types, bytes) {
    var self = this;
    return types.map(function (type, index) {
        var solidityType = self._requireType(type);
        var p = solidityType.sliceParam(bytes, index, type);
        return solidityType.formatOutput(p, isArrayType(type));
    });
};

var coder = new SolidityCoder([
    new SolidityType({
        name: 'address',
        match: 'strict',
        mode: 'value',
        inputFormatter: f.formatInputInt,
        outputFormatter: f.formatOutputAddress
    }),
    new SolidityType({
        name: 'bool',
        match: 'strict',
        mode: 'value',
        inputFormatter: f.formatInputBool,
        outputFormatter: f.formatOutputBool
    }),
    new SolidityType({
        name: 'int',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputInt,
        outputFormatter: f.formatOutputInt,
    }),
    new SolidityType({
        name: 'uint',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputInt,
        outputFormatter: f.formatOutputUInt
    }),
    new SolidityType({
        name: 'bytes',
        match: 'strict',
        mode: 'bytes',
        inputFormatter: f.formatInputDynamicBytes,
        outputFormatter: f.formatOutputDynamicBytes
    }),
    new SolidityType({
        name: 'bytes',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputBytes,
        outputFormatter: f.formatOutputBytes
    }),
    new SolidityType({
        name: 'real',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputReal,
        outputFormatter: f.formatOutputReal
    }),
    new SolidityType({
        name: 'ureal',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputReal,
        outputFormatter: f.formatOutputUReal
    })
]);

module.exports = coder;


},{"../utils/utils":6,"./formatters":2,"./param":3,"bignumber.js":"bignumber.js"}],2:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file formatters.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var BigNumber = require('bignumber.js');
var utils = require('../utils/utils');
var c = require('../utils/config');
var SolidityParam = require('./param');


/**
 * Formats input value to byte representation of int
 * If value is negative, return it's two's complement
 * If the value is floating point, round it down
 *
 * @method formatInputInt
 * @param {String|Number|BigNumber} value that needs to be formatted
 * @returns {SolidityParam}
 */
var formatInputInt = function (value) {
    var padding = c.ETH_PADDING * 2;
    BigNumber.config(c.ETH_BIGNUMBER_ROUNDING_MODE);
    var result = utils.padLeft(utils.toTwosComplement(value).round().toString(16), padding);
    return new SolidityParam(result);
};

/**
 * Formats input value to byte representation of string
 *
 * @method formatInputBytes
 * @param {String}
 * @returns {SolidityParam}
 */
var formatInputBytes = function (value) {
    var result = utils.fromAscii(value, c.ETH_PADDING).substr(2);
    return new SolidityParam(result);
};

/**
 * Formats input value to byte representation of string
 *
 * @method formatInputDynamicBytes
 * @param {String}
 * @returns {SolidityParam}
 */
var formatInputDynamicBytes = function (value) {
    var result = utils.fromAscii(value, c.ETH_PADDING).substr(2);
    return new SolidityParam(formatInputInt(value.length).value + result, 32);
};

/**
 * Formats input value to byte representation of bool
 *
 * @method formatInputBool
 * @param {Boolean}
 * @returns {SolidityParam}
 */
var formatInputBool = function (value) {
    var result = '000000000000000000000000000000000000000000000000000000000000000' + (value ?  '1' : '0');
    return new SolidityParam(result);
};

/**
 * Formats input value to byte representation of real
 * Values are multiplied by 2^m and encoded as integers
 *
 * @method formatInputReal
 * @param {String|Number|BigNumber}
 * @returns {SolidityParam}
 */
var formatInputReal = function (value) {
    return formatInputInt(new BigNumber(value).times(new BigNumber(2).pow(128)));
};

/**
 * Check if input value is negative
 *
 * @method signedIsNegative
 * @param {String} value is hex format
 * @returns {Boolean} true if it is negative, otherwise false
 */
var signedIsNegative = function (value) {
    return (new BigNumber(value.substr(0, 1), 16).toString(2).substr(0, 1)) === '1';
};

/**
 * Formats right-aligned output bytes to int
 *
 * @method formatOutputInt
 * @param {SolidityParam} param
 * @returns {BigNumber} right-aligned output bytes formatted to big number
 */
var formatOutputInt = function (param) {
    var value = param.staticPart() || "0";

    // check if it's negative number
    // it it is, return two's complement
    if (signedIsNegative(value)) {
        return new BigNumber(value, 16).minus(new BigNumber('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16)).minus(1);
    }
    return new BigNumber(value, 16);
};

/**
 * Formats right-aligned output bytes to uint
 *
 * @method formatOutputUInt
 * @param {SolidityParam}
 * @returns {BigNumeber} right-aligned output bytes formatted to uint
 */
var formatOutputUInt = function (param) {
    var value = param.staticPart() || "0";
    return new BigNumber(value, 16);
};

/**
 * Formats right-aligned output bytes to real
 *
 * @method formatOutputReal
 * @param {SolidityParam}
 * @returns {BigNumber} input bytes formatted to real
 */
var formatOutputReal = function (param) {
    return formatOutputInt(param).dividedBy(new BigNumber(2).pow(128)); 
};

/**
 * Formats right-aligned output bytes to ureal
 *
 * @method formatOutputUReal
 * @param {SolidityParam}
 * @returns {BigNumber} input bytes formatted to ureal
 */
var formatOutputUReal = function (param) {
    return formatOutputUInt(param).dividedBy(new BigNumber(2).pow(128)); 
};

/**
 * Should be used to format output bool
 *
 * @method formatOutputBool
 * @param {SolidityParam}
 * @returns {Boolean} right-aligned input bytes formatted to bool
 */
var formatOutputBool = function (param) {
    return param.staticPart() === '0000000000000000000000000000000000000000000000000000000000000001' ? true : false;
};

/**
 * Should be used to format output string
 *
 * @method formatOutputBytes
 * @param {SolidityParam} left-aligned hex representation of string
 * @returns {String} ascii string
 */
var formatOutputBytes = function (param) {
    // length might also be important!
    return utils.toAscii(param.staticPart());
};

/**
 * Should be used to format output string
 *
 * @method formatOutputDynamicBytes
 * @param {SolidityParam} left-aligned hex representation of string
 * @returns {String} ascii string
 */
var formatOutputDynamicBytes = function (param) {
    // length might also be important!
    return utils.toAscii(param.dynamicPart().slice(64));
};

/**
 * Should be used to format output address
 *
 * @method formatOutputAddress
 * @param {SolidityParam} right-aligned input bytes
 * @returns {String} address
 */
var formatOutputAddress = function (param) {
    var value = param.staticPart();
    return "0x" + value.slice(value.length - 40, value.length);
};

module.exports = {
    formatInputInt: formatInputInt,
    formatInputBytes: formatInputBytes,
    formatInputDynamicBytes: formatInputDynamicBytes,
    formatInputBool: formatInputBool,
    formatInputReal: formatInputReal,
    formatOutputInt: formatOutputInt,
    formatOutputUInt: formatOutputUInt,
    formatOutputReal: formatOutputReal,
    formatOutputUReal: formatOutputUReal,
    formatOutputBool: formatOutputBool,
    formatOutputBytes: formatOutputBytes,
    formatOutputDynamicBytes: formatOutputDynamicBytes,
    formatOutputAddress: formatOutputAddress
};


},{"../utils/config":5,"../utils/utils":6,"./param":3,"bignumber.js":"bignumber.js"}],3:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file param.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var utils = require('../utils/utils');

/**
 * SolidityParam object prototype.
 * Should be used when encoding, decoding solidity bytes
 */
var SolidityParam = function (value, offset) {
    this.value = value || '';
    this.offset = offset; // offset in bytes
};

/**
 * This method should be used to get length of params's dynamic part
 * 
 * @method dynamicPartLength
 * @returns {Number} length of dynamic part (in bytes)
 */
SolidityParam.prototype.dynamicPartLength = function () {
    return this.dynamicPart().length / 2;
};

/**
 * This method should be used to create copy of solidity param with different offset
 *
 * @method withOffset
 * @param {Number} offset length in bytes
 * @returns {SolidityParam} new solidity param with applied offset
 */
SolidityParam.prototype.withOffset = function (offset) {
    return new SolidityParam(this.value, offset);
};

/**
 * This method should be used to combine solidity params together
 * eg. when appending an array
 *
 * @method combine
 * @param {SolidityParam} param with which we should combine
 * @param {SolidityParam} result of combination
 */
SolidityParam.prototype.combine = function (param) {
    return new SolidityParam(this.value + param.value); 
};

/**
 * This method should be called to check if param has dynamic size.
 * If it has, it returns true, otherwise false
 *
 * @method isDynamic
 * @returns {Boolean}
 */
SolidityParam.prototype.isDynamic = function () {
    return this.value.length > 64 || this.offset !== undefined;
};

/**
 * This method should be called to transform offset to bytes
 *
 * @method offsetAsBytes
 * @returns {String} bytes representation of offset
 */
SolidityParam.prototype.offsetAsBytes = function () {
    return !this.isDynamic() ? '' : utils.padLeft(utils.toTwosComplement(this.offset).toString(16), 64);
};

/**
 * This method should be called to get static part of param
 *
 * @method staticPart
 * @returns {String} offset if it is a dynamic param, otherwise value
 */
SolidityParam.prototype.staticPart = function () {
    if (!this.isDynamic()) {
        return this.value; 
    } 
    return this.offsetAsBytes();
};

/**
 * This method should be called to get dynamic part of param
 *
 * @method dynamicPart
 * @returns {String} returns a value if it is a dynamic param, otherwise empty string
 */
SolidityParam.prototype.dynamicPart = function () {
    return this.isDynamic() ? this.value : '';
};

/**
 * This method should be called to encode param
 *
 * @method encode
 * @returns {String}
 */
SolidityParam.prototype.encode = function () {
    return this.staticPart() + this.dynamicPart();
};

/**
 * This method should be called to encode array of params
 *
 * @method encodeList
 * @param {Array[SolidityParam]} params
 * @returns {String}
 */
SolidityParam.encodeList = function (params) {
    
    // updating offsets
    var totalOffset = params.length * 32;
    var offsetParams = params.map(function (param) {
        if (!param.isDynamic()) {
            return param;
        }
        var offset = totalOffset;
        totalOffset += param.dynamicPartLength();
        return param.withOffset(offset);
    });

    // encode everything!
    return offsetParams.reduce(function (result, param) {
        return result + param.dynamicPart();
    }, offsetParams.reduce(function (result, param) {
        return result + param.staticPart();
    }, ''));
};

/**
 * This method should be used to decode plain (static) solidity param at given index
 *
 * @method decodeParam
 * @param {String} bytes
 * @param {Number} index
 * @returns {SolidityParam}
 */
SolidityParam.decodeParam = function (bytes, index) {
    index = index || 0;
    return new SolidityParam(bytes.substr(index * 64, 64)); 
};

/**
 * This method should be called to get offset value from bytes at given index
 *
 * @method getOffset
 * @param {String} bytes
 * @param {Number} index
 * @returns {Number} offset as number
 */
var getOffset = function (bytes, index) {
    // we can do this cause offset is rather small
    return parseInt('0x' + bytes.substr(index * 64, 64));
};

/**
 * This method should be called to decode solidity bytes param at given index
 *
 * @method decodeBytes
 * @param {String} bytes
 * @param {Number} index
 * @returns {SolidityParam}
 */
SolidityParam.decodeBytes = function (bytes, index) {
    index = index || 0;
    //TODO add support for strings longer than 32 bytes
    //var length = parseInt('0x' + bytes.substr(offset * 64, 64));

    var offset = getOffset(bytes, index);

    // 2 * , cause we also parse length
    return new SolidityParam(bytes.substr(offset * 2, 2 * 64), 0);
};

/**
 * This method should be used to decode solidity array at given index
 *
 * @method decodeArray
 * @param {String} bytes
 * @param {Number} index
 * @returns {SolidityParam}
 */
SolidityParam.decodeArray = function (bytes, index) {
    index = index || 0;
    var offset = getOffset(bytes, index);
    var length = parseInt('0x' + bytes.substr(offset * 2, 64));
    return new SolidityParam(bytes.substr(offset * 2, (length + 1) * 64), 0);
};

module.exports = SolidityParam;


},{"../utils/utils":6}],4:[function(require,module,exports){
'use strict';

// go env doesn't have and need XMLHttpRequest
if (typeof XMLHttpRequest === 'undefined') {
    exports.XMLHttpRequest = {};
} else {
    exports.XMLHttpRequest = XMLHttpRequest; // jshint ignore:line
}


},{}],5:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file config.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

/**
 * Utils
 * 
 * @module utils
 */

/**
 * Utility functions
 * 
 * @class [utils] config
 * @constructor
 */

/// required to define ETH_BIGNUMBER_ROUNDING_MODE
var BigNumber = require('bignumber.js');

var ETH_UNITS = [ 
    'wei', 
    'Kwei', 
    'Mwei', 
    'Gwei', 
    'szabo', 
    'finney', 
    'ether', 
    'grand', 
    'Mether', 
    'Gether', 
    'Tether', 
    'Pether', 
    'Eether', 
    'Zether', 
    'Yether', 
    'Nether', 
    'Dether', 
    'Vether', 
    'Uether' 
];

module.exports = {
    ETH_PADDING: 32,
    ETH_SIGNATURE_LENGTH: 4,
    ETH_UNITS: ETH_UNITS,
    ETH_BIGNUMBER_ROUNDING_MODE: { ROUNDING_MODE: BigNumber.ROUND_DOWN },
    ETH_POLLING_TIMEOUT: 1000,
    defaultBlock: 'latest',
    defaultAccount: undefined
};


},{"bignumber.js":"bignumber.js"}],6:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file utils.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

/**
 * Utils
 * 
 * @module utils
 */

/**
 * Utility functions
 * 
 * @class [utils] utils
 * @constructor
 */

var BigNumber = require('bignumber.js');

var unitMap = {
    'wei':      '1',
    'kwei':     '1000',
    'ada':      '1000',
    'mwei':     '1000000',
    'babbage':  '1000000',
    'gwei':     '1000000000',
    'shannon':  '1000000000',
    'szabo':    '1000000000000',
    'finney':   '1000000000000000',
    'ether':    '1000000000000000000',
    'kether':   '1000000000000000000000',
    'grand':    '1000000000000000000000',
    'einstein': '1000000000000000000000',
    'mether':   '1000000000000000000000000',
    'gether':   '1000000000000000000000000000',
    'tether':   '1000000000000000000000000000000'
};

/**
 * Should be called to pad string to expected length
 *
 * @method padLeft
 * @param {String} string to be padded
 * @param {Number} characters that result string should have
 * @param {String} sign, by default 0
 * @returns {String} right aligned string
 */
var padLeft = function (string, chars, sign) {
    return new Array(chars - string.length + 1).join(sign ? sign : "0") + string;
};

/** 
 * Should be called to get sting from it's hex representation
 *
 * @method toAscii
 * @param {String} string in hex
 * @returns {String} ascii string representation of hex value
 */
var toAscii = function(hex) {
// Find termination
    var str = "";
    var i = 0, l = hex.length;
    if (hex.substring(0, 2) === '0x') {
        i = 2;
    }
    for (; i < l; i+=2) {
        var code = parseInt(hex.substr(i, 2), 16);
        if (code === 0) {
            break;
        }

        str += String.fromCharCode(code);
    }

    return str;
};
    
/**
 * Shold be called to get hex representation (prefixed by 0x) of ascii string 
 *
 * @method toHexNative
 * @param {String} string
 * @returns {String} hex representation of input string
 */
var toHexNative = function(str) {
    var hex = "";
    for(var i = 0; i < str.length; i++) {
        var n = str.charCodeAt(i).toString(16);
        hex += n.length < 2 ? '0' + n : n;
    }

    return hex;
};

/**
 * Shold be called to get hex representation (prefixed by 0x) of ascii string 
 *
 * @method fromAscii
 * @param {String} string
 * @param {Number} optional padding
 * @returns {String} hex representation of input string
 */
var fromAscii = function(str, pad) {
    pad = pad === undefined ? 0 : pad;
    var hex = toHexNative(str);
    while (hex.length < pad*2)
        hex += "00";
    return "0x" + hex;
};

/**
 * Should be used to create full function/event name from json abi
 *
 * @method transformToFullName
 * @param {Object} json-abi
 * @return {String} full fnction/event name
 */
var transformToFullName = function (json) {
    if (json.name.indexOf('(') !== -1) {
        return json.name;
    }

    var typeName = json.inputs.map(function(i){return i.type; }).join();
    return json.name + '(' + typeName + ')';
};

/**
 * Should be called to get display name of contract function
 * 
 * @method extractDisplayName
 * @param {String} name of function/event
 * @returns {String} display name for function/event eg. multiply(uint256) -> multiply
 */
var extractDisplayName = function (name) {
    var length = name.indexOf('('); 
    return length !== -1 ? name.substr(0, length) : name;
};

/// @returns overloaded part of function/event name
var extractTypeName = function (name) {
    /// TODO: make it invulnerable
    var length = name.indexOf('(');
    return length !== -1 ? name.substr(length + 1, name.length - 1 - (length + 1)).replace(' ', '') : "";
};

/**
 * Converts value to it's decimal representation in string
 *
 * @method toDecimal
 * @param {String|Number|BigNumber}
 * @return {String}
 */
var toDecimal = function (value) {
    return toBigNumber(value).toNumber();
};

/**
 * Converts value to it's hex representation
 *
 * @method fromDecimal
 * @param {String|Number|BigNumber}
 * @return {String}
 */
var fromDecimal = function (value) {
    var number = toBigNumber(value);
    var result = number.toString(16);

    return number.lessThan(0) ? '-0x' + result.substr(1) : '0x' + result;
};

/**
 * Auto converts any given value into it's hex representation.
 *
 * And even stringifys objects before.
 *
 * @method toHex
 * @param {String|Number|BigNumber|Object}
 * @return {String}
 */
var toHex = function (val) {
    /*jshint maxcomplexity:7 */

    if (isBoolean(val))
        return fromDecimal(+val);

    if (isBigNumber(val))
        return fromDecimal(val);

    if (isObject(val))
        return fromAscii(JSON.stringify(val));

    // if its a negative number, pass it through fromDecimal
    if (isString(val)) {
        if (val.indexOf('-0x') === 0)
           return fromDecimal(val);
        else if (!isFinite(val))
            return fromAscii(val);
    }

    return fromDecimal(val);
};

/**
 * Returns value of unit in Wei
 *
 * @method getValueOfUnit
 * @param {String} unit the unit to convert to, default ether
 * @returns {BigNumber} value of the unit (in Wei)
 * @throws error if the unit is not correct:w
 */
var getValueOfUnit = function (unit) {
    unit = unit ? unit.toLowerCase() : 'ether';
    var unitValue = unitMap[unit];
    if (unitValue === undefined) {
        throw new Error('This unit doesn\'t exists, please use the one of the following units' + JSON.stringify(unitMap, null, 2));
    }
    return new BigNumber(unitValue, 10);
};

/**
 * Takes a number of wei and converts it to any other ether unit.
 *
 * Possible units are:
 * - kwei/ada
 * - mwei/babbage
 * - gwei/shannon
 * - szabo
 * - finney
 * - ether
 * - kether/grand/einstein
 * - mether
 * - gether
 * - tether
 *
 * @method fromWei
 * @param {Number|String} number can be a number, number string or a HEX of a decimal
 * @param {String} unit the unit to convert to, default ether
 * @return {String|Object} When given a BigNumber object it returns one as well, otherwise a number
*/
var fromWei = function(number, unit) {
    var returnValue = toBigNumber(number).dividedBy(getValueOfUnit(unit));

    return isBigNumber(number) ? returnValue : returnValue.toString(10); 
};

/**
 * Takes a number of a unit and converts it to wei.
 *
 * Possible units are:
 * - kwei/ada
 * - mwei/babbage
 * - gwei/shannon
 * - szabo
 * - finney
 * - ether
 * - kether/grand/einstein
 * - mether
 * - gether
 * - tether
 *
 * @method toWei
 * @param {Number|String|BigNumber} number can be a number, number string or a HEX of a decimal
 * @param {String} unit the unit to convert from, default ether
 * @return {String|Object} When given a BigNumber object it returns one as well, otherwise a number
*/
var toWei = function(number, unit) {
    var returnValue = toBigNumber(number).times(getValueOfUnit(unit));

    return isBigNumber(number) ? returnValue : returnValue.toString(10); 
};

/**
 * Takes an input and transforms it into an bignumber
 *
 * @method toBigNumber
 * @param {Number|String|BigNumber} a number, string, HEX string or BigNumber
 * @return {BigNumber} BigNumber
*/
var toBigNumber = function(number) {
    /*jshint maxcomplexity:5 */
    number = number || 0;
    if (isBigNumber(number))
        return number;

    if (isString(number) && (number.indexOf('0x') === 0 || number.indexOf('-0x') === 0)) {
        return new BigNumber(number.replace('0x',''), 16);
    }
   
    return new BigNumber(number.toString(10), 10);
};

/**
 * Takes and input transforms it into bignumber and if it is negative value, into two's complement
 *
 * @method toTwosComplement
 * @param {Number|String|BigNumber}
 * @return {BigNumber}
 */
var toTwosComplement = function (number) {
    var bigNumber = toBigNumber(number);
    if (bigNumber.lessThan(0)) {
        return new BigNumber("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16).plus(bigNumber).plus(1);
    }
    return bigNumber;
};

/**
 * Checks if the given string is strictly an address
 *
 * @method isStrictAddress
 * @param {String} address the given HEX adress
 * @return {Boolean}
*/
var isStrictAddress = function (address) {
    return /^0x[0-9a-f]{40}$/.test(address);
};

/**
 * Checks if the given string is an address
 *
 * @method isAddress
 * @param {String} address the given HEX adress
 * @return {Boolean}
*/
var isAddress = function (address) {
    return /^(0x)?[0-9a-f]{40}$/.test(address);
};

/**
 * Transforms given string to valid 20 bytes-length addres with 0x prefix
 *
 * @method toAddress
 * @param {String} address
 * @return {String} formatted address
 */
var toAddress = function (address) {
    if (isStrictAddress(address)) {
        return address;
    }
    
    if (/^[0-9a-f]{40}$/.test(address)) {
        return '0x' + address;
    }

    return '0x' + padLeft(toHex(address).substr(2), 40);
};


/**
 * Returns true if object is BigNumber, otherwise false
 *
 * @method isBigNumber
 * @param {Object}
 * @return {Boolean} 
 */
var isBigNumber = function (object) {
    return object instanceof BigNumber ||
        (object && object.constructor && object.constructor.name === 'BigNumber');
};

/**
 * Returns true if object is string, otherwise false
 * 
 * @method isString
 * @param {Object}
 * @return {Boolean}
 */
var isString = function (object) {
    return typeof object === 'string' ||
        (object && object.constructor && object.constructor.name === 'String');
};

/**
 * Returns true if object is function, otherwise false
 *
 * @method isFunction
 * @param {Object}
 * @return {Boolean}
 */
var isFunction = function (object) {
    return typeof object === 'function';
};

/**
 * Returns true if object is Objet, otherwise false
 *
 * @method isObject
 * @param {Object}
 * @return {Boolean}
 */
var isObject = function (object) {
    return typeof object === 'object';
};

/**
 * Returns true if object is boolean, otherwise false
 *
 * @method isBoolean
 * @param {Object}
 * @return {Boolean}
 */
var isBoolean = function (object) {
    return typeof object === 'boolean';
};

/**
 * Returns true if object is array, otherwise false
 *
 * @method isArray
 * @param {Object}
 * @return {Boolean}
 */
var isArray = function (object) {
    return object instanceof Array; 
};

/**
 * Returns true if given string is valid json object
 * 
 * @method isJson
 * @param {String}
 * @return {Boolean}
 */
var isJson = function (str) {
    try {
        return !!JSON.parse(str);
    } catch (e) {
        return false;
    }
};

module.exports = {
    padLeft: padLeft,
    toHex: toHex,
    toDecimal: toDecimal,
    fromDecimal: fromDecimal,
    toAscii: toAscii,
    fromAscii: fromAscii,
    transformToFullName: transformToFullName,
    extractDisplayName: extractDisplayName,
    extractTypeName: extractTypeName,
    toWei: toWei,
    fromWei: fromWei,
    toBigNumber: toBigNumber,
    toTwosComplement: toTwosComplement,
    toAddress: toAddress,
    isBigNumber: isBigNumber,
    isStrictAddress: isStrictAddress,
    isAddress: isAddress,
    isFunction: isFunction,
    isString: isString,
    isObject: isObject,
    isBoolean: isBoolean,
    isArray: isArray,
    isJson: isJson
};


},{"bignumber.js":"bignumber.js"}],7:[function(require,module,exports){
module.exports={
    "version": "0.4.3"
}

},{}],8:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file web3.js
 * @authors:
 *   Jeffrey Wilcke <jeff@ethdev.com>
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 *   Fabian Vogelsteller <fabian@ethdev.com>
 *   Gav Wood <g@ethdev.com>
 * @date 2014
 */

var version = require('./version.json');
var net = require('./web3/net');
var eth = require('./web3/eth');
var db = require('./web3/db');
var shh = require('./web3/shh');
var watches = require('./web3/watches');
var Filter = require('./web3/filter');
var utils = require('./utils/utils');
var formatters = require('./web3/formatters');
var RequestManager = require('./web3/requestmanager');
var c = require('./utils/config');
var Method = require('./web3/method');
var Property = require('./web3/property');
var Batch = require('./web3/batch');

var web3Methods = [
    new Method({
        name: 'sha3',
        call: 'web3_sha3',
        params: 1
    })
];

var web3Properties = [
    new Property({
        name: 'version.client',
        getter: 'web3_clientVersion'
    }),
    new Property({
        name: 'version.network',
        getter: 'net_version',
        inputFormatter: utils.toDecimal
    }),
    new Property({
        name: 'version.ethereum',
        getter: 'eth_protocolVersion',
        inputFormatter: utils.toDecimal
    }),
    new Property({
        name: 'version.whisper',
        getter: 'shh_version',
        inputFormatter: utils.toDecimal
    })
];

/// creates methods in a given object based on method description on input
/// setups api calls for these methods
var setupMethods = function (obj, methods) {
    methods.forEach(function (method) {
        method.attachToObject(obj);
    });
};

/// creates properties in a given object based on properties description on input
/// setups api calls for these properties
var setupProperties = function (obj, properties) {
    properties.forEach(function (property) {
        property.attachToObject(obj);
    });
};

/// setups web3 object, and it's in-browser executed methods
var web3 = {};
web3.providers = {};
web3.version = {};
web3.version.api = version.version;
web3.eth = {};

/*jshint maxparams:4 */
web3.eth.filter = function (fil, eventParams, options, formatter) {

    // if its event, treat it differently
    // TODO: simplify and remove
    if (fil._isEvent) {
        return fil(eventParams, options);
    }

    // what outputLogFormatter? that's wrong
    //return new Filter(fil, watches.eth(), formatters.outputLogFormatter);
    return new Filter(fil, watches.eth(), formatter || formatters.outputLogFormatter);
};
/*jshint maxparams:3 */

web3.shh = {};
web3.shh.filter = function (fil) {
    return new Filter(fil, watches.shh(), formatters.outputPostFormatter);
};
web3.net = {};
web3.db = {};
web3.setProvider = function (provider) {
    RequestManager.getInstance().setProvider(provider);
};
web3.reset = function () {
    RequestManager.getInstance().reset();
    c.defaultBlock = 'latest';
    c.defaultAccount = undefined;
};
web3.toHex = utils.toHex;
web3.toAscii = utils.toAscii;
web3.fromAscii = utils.fromAscii;
web3.toDecimal = utils.toDecimal;
web3.fromDecimal = utils.fromDecimal;
web3.toBigNumber = utils.toBigNumber;
web3.toWei = utils.toWei;
web3.fromWei = utils.fromWei;
web3.isAddress = utils.isAddress;
web3.createBatch = function () {
    return new Batch();
};

// ADD defaultblock
Object.defineProperty(web3.eth, 'defaultBlock', {
    get: function () {
        return c.defaultBlock;
    },
    set: function (val) {
        c.defaultBlock = val;
        return val;
    }
});

Object.defineProperty(web3.eth, 'defaultAccount', {
    get: function () {
        return c.defaultAccount;
    },
    set: function (val) {
        c.defaultAccount = val;
        return val;
    }
});

/// setups all api methods
setupMethods(web3, web3Methods);
setupProperties(web3, web3Properties);
setupMethods(web3.net, net.methods);
setupProperties(web3.net, net.properties);
setupMethods(web3.eth, eth.methods);
setupProperties(web3.eth, eth.properties);
setupMethods(web3.db, db.methods);
setupMethods(web3.shh, shh.methods);

module.exports = web3;


},{"./utils/config":5,"./utils/utils":6,"./version.json":7,"./web3/batch":9,"./web3/db":11,"./web3/eth":13,"./web3/filter":15,"./web3/formatters":16,"./web3/method":20,"./web3/net":21,"./web3/property":22,"./web3/requestmanager":24,"./web3/shh":25,"./web3/watches":26}],9:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file batch.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var RequestManager = require('./requestmanager');

var Batch = function () {
    this.requests = [];
};

/**
 * Should be called to add create new request to batch request
 *
 * @method add
 * @param {Object} jsonrpc requet object
 */
Batch.prototype.add = function (request) {
    this.requests.push(request);
};

/**
 * Should be called to execute batch request
 *
 * @method execute
 */
Batch.prototype.execute = function () {
    var requests = this.requests;
    RequestManager.getInstance().sendBatch(requests, function (err, results) {
        results = results || [];
        requests.map(function (request, index) {
            return results[index] || {};
        }).map(function (result, index) {
            return requests[index].format ? requests[index].format(result.result) : result.result;
        }).forEach(function (result, index) {
            if (requests[index].callback) {
                requests[index].callback(err, result);
            }
        });
    }); 
};

module.exports = Batch;


},{"./requestmanager":24}],10:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file contract.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2014
 */

var web3 = require('../web3'); 
var utils = require('../utils/utils');
var coder = require('../solidity/coder');
var SolidityEvent = require('./event');
var SolidityFunction = require('./function');

/**
 * Should be called to encode constructor params
 *
 * @method encodeConstructorParams
 * @param {Array} abi
 * @param {Array} constructor params
 */
var encodeConstructorParams = function (abi, params) {
    return abi.filter(function (json) {
        return json.type === 'constructor' && json.inputs.length === params.length;
    }).map(function (json) {
        return json.inputs.map(function (input) {
            return input.type;
        });
    }).map(function (types) {
        return coder.encodeParams(types, params);
    })[0] || '';
};

/**
 * Should be called to add functions to contract object
 *
 * @method addFunctionsToContract
 * @param {Contract} contract
 * @param {Array} abi
 */
var addFunctionsToContract = function (contract, abi) {
    abi.filter(function (json) {
        return json.type === 'function';
    }).map(function (json) {
        return new SolidityFunction(json, contract.address);
    }).forEach(function (f) {
        f.attachToContract(contract);
    });
};

/**
 * Should be called to add events to contract object
 *
 * @method addEventsToContract
 * @param {Contract} contract
 * @param {Array} abi
 */
var addEventsToContract = function (contract, abi) {
    abi.filter(function (json) {
        return json.type === 'event';
    }).map(function (json) {
        return new SolidityEvent(json, contract.address);
    }).forEach(function (e) {
        e.attachToContract(contract);
    });
};

/**
 * Should be called to create new ContractFactory
 *
 * @method contract
 * @param {Array} abi
 * @returns {ContractFactory} new contract factory
 */
var contract = function (abi) {
    return new ContractFactory(abi);
};

/**
 * Should be called to create new ContractFactory instance
 *
 * @method ContractFactory
 * @param {Array} abi
 */
var ContractFactory = function (abi) {
    this.abi = abi;
};

/**
 * Should be called to create new contract on a blockchain
 * 
 * @method new
 * @param {Any} contract constructor param1 (optional)
 * @param {Any} contract constructor param2 (optional)
 * @param {Object} contract transaction object (required)
 * @param {Function} callback
 * @returns {Contract} returns contract if no callback was passed,
 * otherwise calls callback function (err, contract)
 */
ContractFactory.prototype.new = function () {
    // parse arguments
    var options = {}; // required!
    var callback;

    var args = Array.prototype.slice.call(arguments);
    if (utils.isFunction(args[args.length - 1])) {
        callback = args.pop();
    }

    var last = args[args.length - 1];
    if (utils.isObject(last) && !utils.isArray(last)) {
        options = args.pop();
    }

    // throw an error if there are no options

    var bytes = encodeConstructorParams(this.abi, args);
    options.data += bytes;

    if (!callback) {
        var address = web3.eth.sendTransaction(options);
        return this.at(address);
    }
  
    var self = this;
    web3.eth.sendTransaction(options, function (err, address) {
        if (err) {
            callback(err);
        }
        self.at(address, callback); 
    }); 
};

/**
 * Should be called to get access to existing contract on a blockchain
 *
 * @method at
 * @param {Address} contract address (required)
 * @param {Function} callback {optional)
 * @returns {Contract} returns contract if no callback was passed,
 * otherwise calls callback function (err, contract)
 */
ContractFactory.prototype.at = function (address, callback) {
    // TODO: address is required
    
    if (callback) {
        callback(null, new Contract(this.abi, address));
    } 
    return new Contract(this.abi, address);
};

/**
 * Should be called to create new contract instance
 *
 * @method Contract
 * @param {Array} abi
 * @param {Address} contract address
 */
var Contract = function (abi, address) {
    this.address = address;
    addFunctionsToContract(this, abi);
    addEventsToContract(this, abi);
};

module.exports = contract;


},{"../solidity/coder":1,"../utils/utils":6,"../web3":8,"./event":14,"./function":17}],11:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file db.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Method = require('./method');

var putString = new Method({
    name: 'putString',
    call: 'db_putString',
    params: 3
});


var getString = new Method({
    name: 'getString',
    call: 'db_getString',
    params: 2
});

var putHex = new Method({
    name: 'putHex',
    call: 'db_putHex',
    params: 3
});

var getHex = new Method({
    name: 'getHex',
    call: 'db_getHex',
    params: 2
});

var methods = [
    putString, getString, putHex, getHex
];

module.exports = {
    methods: methods
};

},{"./method":20}],12:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file errors.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

module.exports = {
    InvalidNumberOfParams: function () {
        return new Error('Invalid number of input parameters');
    },
    InvalidConnection: function (host){
        return new Error('CONNECTION ERROR: Couldn\'t connect to node '+ host +', is it running?');
    },
    InvalidProvider: function () {
        return new Error('Providor not set or invalid');
    },
    InvalidResponse: function (result){
        var message = !!result && !!result.error && !!result.error.message ? result.error.message : 'Invalid JSON RPC response';
        return new Error(message);
    }
};


},{}],13:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file eth.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @author Fabian Vogelsteller <fabian@ethdev.com>
 * @date 2015
 */

/**
 * Web3
 *
 * @module web3
 */

/**
 * Eth methods and properties
 *
 * An example method object can look as follows:
 *
 *      {
 *      name: 'getBlock',
 *      call: blockCall,
 *      params: 2,
 *      outputFormatter: formatters.outputBlockFormatter,
 *      inputFormatter: [ // can be a formatter funciton or an array of functions. Where each item in the array will be used for one parameter
 *           utils.toHex, // formats paramter 1
 *           function(param){ return !!param; } // formats paramter 2
 *         ]
 *       },
 *
 * @class [web3] eth
 * @constructor
 */

"use strict";

var formatters = require('./formatters');
var utils = require('../utils/utils');
var Method = require('./method');
var Property = require('./property');

var blockCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? "eth_getBlockByHash" : "eth_getBlockByNumber";
};

var transactionFromBlockCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getTransactionByBlockHashAndIndex' : 'eth_getTransactionByBlockNumberAndIndex';
};

var uncleCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getUncleByBlockHashAndIndex' : 'eth_getUncleByBlockNumberAndIndex';
};

var getBlockTransactionCountCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getBlockTransactionCountByHash' : 'eth_getBlockTransactionCountByNumber';
};

var uncleCountCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getUncleCountByBlockHash' : 'eth_getUncleCountByBlockNumber';
};

/// @returns an array of objects describing web3.eth api methods

var getBalance = new Method({
    name: 'getBalance',
    call: 'eth_getBalance',
    params: 2,
    inputFormatter: [utils.toAddress, formatters.inputDefaultBlockNumberFormatter],
    outputFormatter: formatters.outputBigNumberFormatter
});

var getStorageAt = new Method({
    name: 'getStorageAt',
    call: 'eth_getStorageAt',
    params: 3,
    inputFormatter: [null, utils.toHex, formatters.inputDefaultBlockNumberFormatter]
});

var getCode = new Method({
    name: 'getCode',
    call: 'eth_getCode',
    params: 2,
    inputFormatter: [utils.toAddress, formatters.inputDefaultBlockNumberFormatter]
});

var getBlock = new Method({
    name: 'getBlock',
    call: blockCall,
    params: 2,
    inputFormatter: [formatters.inputBlockNumberFormatter, function (val) { return !!val; }],
    outputFormatter: formatters.outputBlockFormatter
});

var getUncle = new Method({
    name: 'getUncle',
    call: uncleCall,
    params: 2,
    inputFormatter: [formatters.inputBlockNumberFormatter, utils.toHex],
    outputFormatter: formatters.outputBlockFormatter,

});

var getCompilers = new Method({
    name: 'getCompilers',
    call: 'eth_getCompilers',
    params: 0
});

var getBlockTransactionCount = new Method({
    name: 'getBlockTransactionCount',
    call: getBlockTransactionCountCall,
    params: 1,
    inputFormatter: [formatters.inputBlockNumberFormatter],
    outputFormatter: utils.toDecimal
});

var getBlockUncleCount = new Method({
    name: 'getBlockUncleCount',
    call: uncleCountCall,
    params: 1,
    inputFormatter: [formatters.inputBlockNumberFormatter],
    outputFormatter: utils.toDecimal
});

var getTransaction = new Method({
    name: 'getTransaction',
    call: 'eth_getTransactionByHash',
    params: 1,
    outputFormatter: formatters.outputTransactionFormatter
});

var getTransactionFromBlock = new Method({
    name: 'getTransactionFromBlock',
    call: transactionFromBlockCall,
    params: 2,
    inputFormatter: [formatters.inputBlockNumberFormatter, utils.toHex],
    outputFormatter: formatters.outputTransactionFormatter
});

var getTransactionCount = new Method({
    name: 'getTransactionCount',
    call: 'eth_getTransactionCount',
    params: 2,
    inputFormatter: [null, formatters.inputDefaultBlockNumberFormatter],
    outputFormatter: utils.toDecimal
});

var sendTransaction = new Method({
    name: 'sendTransaction',
    call: 'eth_sendTransaction',
    params: 1,
    inputFormatter: [formatters.inputTransactionFormatter]
});

var call = new Method({
    name: 'call',
    call: 'eth_call',
    params: 2,
    inputFormatter: [formatters.inputTransactionFormatter, formatters.inputDefaultBlockNumberFormatter]
});

var estimateGas = new Method({
    name: 'estimateGas',
    call: 'eth_estimateGas',
    params: 1,
    inputFormatter: [formatters.inputTransactionFormatter],
    outputFormatter: utils.toDecimal
});

var compileSolidity = new Method({
    name: 'compile.solidity',
    call: 'eth_compileSolidity',
    params: 1
});

var compileLLL = new Method({
    name: 'compile.lll',
    call: 'eth_compileLLL',
    params: 1
});

var compileSerpent = new Method({
    name: 'compile.serpent',
    call: 'eth_compileSerpent',
    params: 1
});

var submitWork = new Method({
    name: 'submitWork',
    call: 'eth_submitWork',
    params: 3
});

var getWork = new Method({
    name: 'getWork',
    call: 'eth_getWork',
    params: 0
});

var methods = [
    getBalance,
    getStorageAt,
    getCode,
    getBlock,
    getUncle,
    getCompilers,
    getBlockTransactionCount,
    getBlockUncleCount,
    getTransaction,
    getTransactionFromBlock,
    getTransactionCount,
    call,
    estimateGas,
    sendTransaction,
    compileSolidity,
    compileLLL,
    compileSerpent,
    submitWork,
    getWork
];

/// @returns an array of objects describing web3.eth api properties



var properties = [
    new Property({
        name: 'coinbase',
        getter: 'eth_coinbase'
    }),
    new Property({
        name: 'mining',
        getter: 'eth_mining'
    }),
    new Property({
        name: 'hashrate',
        getter: 'eth_hashrate',
        outputFormatter: utils.toDecimal
    }),
    new Property({
        name: 'gasPrice',
        getter: 'eth_gasPrice',
        outputFormatter: formatters.outputBigNumberFormatter
    }),
    new Property({
        name: 'accounts',
        getter: 'eth_accounts'
    }),
    new Property({
        name: 'blockNumber',
        getter: 'eth_blockNumber',
        outputFormatter: utils.toDecimal
    })
];

module.exports = {
    methods: methods,
    properties: properties
};


},{"../utils/utils":6,"./formatters":16,"./method":20,"./property":22}],14:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file event.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2014
 */

var utils = require('../utils/utils');
var coder = require('../solidity/coder');
var web3 = require('../web3');
var formatters = require('./formatters');

/**
 * This prototype should be used to create event filters
 */
var SolidityEvent = function (json, address) {
    this._params = json.inputs;
    this._name = utils.transformToFullName(json);
    this._address = address;
    this._anonymous = json.anonymous;
};

/**
 * Should be used to get filtered param types
 *
 * @method types
 * @param {Bool} decide if returned typed should be indexed
 * @return {Array} array of types
 */
SolidityEvent.prototype.types = function (indexed) {
    return this._params.filter(function (i) {
        return i.indexed === indexed;
    }).map(function (i) {
        return i.type;
    });
};

/**
 * Should be used to get event display name
 *
 * @method displayName
 * @return {String} event display name
 */
SolidityEvent.prototype.displayName = function () {
    return utils.extractDisplayName(this._name);
};

/**
 * Should be used to get event type name
 *
 * @method typeName
 * @return {String} event type name
 */
SolidityEvent.prototype.typeName = function () {
    return utils.extractTypeName(this._name);
};

/**
 * Should be used to get event signature
 *
 * @method signature
 * @return {String} event signature
 */
SolidityEvent.prototype.signature = function () {
    return web3.sha3(web3.fromAscii(this._name)).slice(2);
};

/**
 * Should be used to encode indexed params and options to one final object
 * 
 * @method encode
 * @param {Object} indexed
 * @param {Object} options
 * @return {Object} everything combined together and encoded
 */
SolidityEvent.prototype.encode = function (indexed, options) {
    indexed = indexed || {};
    options = options || {};
    var result = {};

    ['fromBlock', 'toBlock'].filter(function (f) {
        return options[f] !== undefined;
    }).forEach(function (f) {
        result[f] = formatters.inputBlockNumberFormatter(options[f]);
    });

    result.topics = [];

    if (!this._anonymous) {
        result.address = this._address;
        result.topics.push('0x' + this.signature());
    }

    var indexedTopics = this._params.filter(function (i) {
        return i.indexed === true;
    }).map(function (i) {
        var value = indexed[i.name];
        if (value === undefined || value === null) {
            return null;
        }
        
        if (utils.isArray(value)) {
            return value.map(function (v) {
                return '0x' + coder.encodeParam(i.type, v);
            });
        }
        return '0x' + coder.encodeParam(i.type, value);
    });

    result.topics = result.topics.concat(indexedTopics);

    return result;
};

/**
 * Should be used to decode indexed params and options
 *
 * @method decode
 * @param {Object} data
 * @return {Object} result object with decoded indexed && not indexed params
 */
SolidityEvent.prototype.decode = function (data) {
 
    data.data = data.data || '';
    data.topics = data.topics || [];

    var argTopics = this._anonymous ? data.topics : data.topics.slice(1);
    var indexedData = argTopics.map(function (topics) { return topics.slice(2); }).join("");
    var indexedParams = coder.decodeParams(this.types(true), indexedData); 

    var notIndexedData = data.data.slice(2);
    var notIndexedParams = coder.decodeParams(this.types(false), notIndexedData);
    
    var result = formatters.outputLogFormatter(data);
    result.event = this.displayName();
    result.address = data.address;

    result.args = this._params.reduce(function (acc, current) {
        acc[current.name] = current.indexed ? indexedParams.shift() : notIndexedParams.shift();
        return acc;
    }, {});

    delete result.data;
    delete result.topics;

    return result;
};

/**
 * Should be used to create new filter object from event
 *
 * @method execute
 * @param {Object} indexed
 * @param {Object} options
 * @return {Object} filter object
 */
SolidityEvent.prototype.execute = function (indexed, options) {
    var o = this.encode(indexed, options);
    var formatter = this.decode.bind(this);
    return web3.eth.filter(o, undefined, undefined, formatter);
};

/**
 * Should be used to attach event to contract object
 *
 * @method attachToContract
 * @param {Contract}
 */
SolidityEvent.prototype.attachToContract = function (contract) {
    var execute = this.execute.bind(this);
    var displayName = this.displayName();
    if (!contract[displayName]) {
        contract[displayName] = execute;
    }
    contract[displayName][this.typeName()] = this.execute.bind(this, contract);
};

module.exports = SolidityEvent;


},{"../solidity/coder":1,"../utils/utils":6,"../web3":8,"./formatters":16}],15:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file filter.js
 * @authors:
 *   Jeffrey Wilcke <jeff@ethdev.com>
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 *   Fabian Vogelsteller <fabian@ethdev.com>
 *   Gav Wood <g@ethdev.com>
 * @date 2014
 */

var RequestManager = require('./requestmanager');
var formatters = require('./formatters');
var utils = require('../utils/utils');

/**
* Converts a given topic to a hex string, but also allows null values.
*
* @param {Mixed} value
* @return {String}
*/
var toTopic = function(value){

    if(value === null || typeof value === 'undefined')
        return null;

    value = String(value);

    if(value.indexOf('0x') === 0)
        return value;
    else
        return utils.fromAscii(value);
};

/// This method should be called on options object, to verify deprecated properties && lazy load dynamic ones
/// @param should be string or object
/// @returns options string or object
var getOptions = function (options) {

    if (utils.isString(options)) {
        return options;
    } 

    options = options || {};

    // make sure topics, get converted to hex
    options.topics = options.topics || [];
    options.topics = options.topics.map(function(topic){
        return (utils.isArray(topic)) ? topic.map(toTopic) : toTopic(topic);
    });

    // lazy load
    return {
        topics: options.topics,
        to: options.to,
        address: options.address,
        fromBlock: formatters.inputBlockNumberFormatter(options.fromBlock),
        toBlock: formatters.inputBlockNumberFormatter(options.toBlock) 
    }; 
};

var Filter = function (options, methods, formatter) {
    var implementation = {};
    methods.forEach(function (method) {
        method.attachToObject(implementation);
    });
    this.options = getOptions(options);
    this.implementation = implementation;
    this.callbacks = [];
    this.formatter = formatter;
    this.filterId = this.implementation.newFilter(this.options);
};

Filter.prototype.watch = function (callback) {
    this.callbacks.push(callback);
    var self = this;

    var onMessage = function (error, messages) {
        if (error) {
            return self.callbacks.forEach(function (callback) {
                callback(error);
            });
        }

        messages.forEach(function (message) {
            message = self.formatter ? self.formatter(message) : message;
            self.callbacks.forEach(function (callback) {
                callback(null, message);
            });
        });
    };

    // call getFilterLogs on start
    if (!utils.isString(this.options)) {
        this.get(function (err, messages) {
            // don't send all the responses to all the watches again... just to this one
            if (err) {
                callback(err);
            }

            messages.forEach(function (message) {
                callback(null, message);
            });
        });
    }

    RequestManager.getInstance().startPolling({
        method: this.implementation.poll.call,
        params: [this.filterId],
    }, this.filterId, onMessage, this.stopWatching.bind(this));
};

Filter.prototype.stopWatching = function () {
    RequestManager.getInstance().stopPolling(this.filterId);
    this.implementation.uninstallFilter(this.filterId);
    this.callbacks = [];
};

Filter.prototype.get = function (callback) {
    var self = this;
    if (utils.isFunction(callback)) {
        this.implementation.getLogs(this.filterId, function(err, res){
            if (err) {
                callback(err);
            } else {
                callback(null, res.map(function (log) {
                    return self.formatter ? self.formatter(log) : log;
                }));
            }
        });
    } else {
        var logs = this.implementation.getLogs(this.filterId);
        return logs.map(function (log) {
            return self.formatter ? self.formatter(log) : log;
        });
    }
};

module.exports = Filter;


},{"../utils/utils":6,"./formatters":16,"./requestmanager":24}],16:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file formatters.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @author Fabian Vogelsteller <fabian@ethdev.com>
 * @date 2015
 */

var utils = require('../utils/utils');
var config = require('../utils/config');

/**
 * Should the format output to a big number
 *
 * @method outputBigNumberFormatter
 * @param {String|Number|BigNumber}
 * @returns {BigNumber} object
 */
var outputBigNumberFormatter = function (number) {
    return utils.toBigNumber(number);
};

var isPredefinedBlockNumber = function (blockNumber) {
    return blockNumber === 'latest' || blockNumber === 'pending' || blockNumber === 'earliest';
};

var inputDefaultBlockNumberFormatter = function (blockNumber) {
    if (blockNumber === undefined) {
        return config.defaultBlock;
    }
    return inputBlockNumberFormatter(blockNumber);
};

var inputBlockNumberFormatter = function (blockNumber) {
    if (blockNumber === undefined) {
        return undefined;
    } else if (isPredefinedBlockNumber(blockNumber)) {
        return blockNumber;
    }
    return utils.toHex(blockNumber);
};

/**
 * Formats the input of a transaction and converts all values to HEX
 *
 * @method inputTransactionFormatter
 * @param {Object} transaction options
 * @returns object
*/
var inputTransactionFormatter = function (options){

    options.from = options.from || config.defaultAccount;

    // make code -> data
    if (options.code) {
        options.data = options.code;
        delete options.code;
    }

    ['gasPrice', 'gas', 'value', 'nonce'].filter(function (key) {
        return options[key] !== undefined;
    }).forEach(function(key){
        options[key] = utils.fromDecimal(options[key]);
    });

    return options; 
};

/**
 * Formats the output of a transaction to its proper values
 * 
 * @method outputTransactionFormatter
 * @param {Object} transaction
 * @returns {Object} transaction
*/
var outputTransactionFormatter = function (tx){
    tx.blockNumber = utils.toDecimal(tx.blockNumber);
    tx.transactionIndex = utils.toDecimal(tx.transactionIndex);
    tx.nonce = utils.toDecimal(tx.nonce);
    tx.gas = utils.toDecimal(tx.gas);
    tx.gasPrice = utils.toBigNumber(tx.gasPrice);
    tx.value = utils.toBigNumber(tx.value);
    return tx;
};

/**
 * Formats the output of a block to its proper values
 *
 * @method outputBlockFormatter
 * @param {Object} block object 
 * @returns {Object} block object
*/
var outputBlockFormatter = function(block) {

    // transform to number
    block.gasLimit = utils.toDecimal(block.gasLimit);
    block.gasUsed = utils.toDecimal(block.gasUsed);
    block.size = utils.toDecimal(block.size);
    block.timestamp = utils.toDecimal(block.timestamp);
    block.number = utils.toDecimal(block.number);

    block.difficulty = utils.toBigNumber(block.difficulty);
    block.totalDifficulty = utils.toBigNumber(block.totalDifficulty);

    if (utils.isArray(block.transactions)) {
        block.transactions.forEach(function(item){
            if(!utils.isString(item))
                return outputTransactionFormatter(item);
        });
    }

    return block;
};

/**
 * Formats the output of a log
 * 
 * @method outputLogFormatter
 * @param {Object} log object
 * @returns {Object} log
*/
var outputLogFormatter = function(log) {
    if (log === null) { // 'pending' && 'latest' filters are nulls
        return null;
    }

    log.blockNumber = utils.toDecimal(log.blockNumber);
    log.transactionIndex = utils.toDecimal(log.transactionIndex);
    log.logIndex = utils.toDecimal(log.logIndex);

    return log;
};

/**
 * Formats the input of a whisper post and converts all values to HEX
 *
 * @method inputPostFormatter
 * @param {Object} transaction object
 * @returns {Object}
*/
var inputPostFormatter = function(post) {

    post.payload = utils.toHex(post.payload);
    post.ttl = utils.fromDecimal(post.ttl);
    post.workToProve = utils.fromDecimal(post.workToProve);
    post.priority = utils.fromDecimal(post.priority);

    // fallback
    if (!utils.isArray(post.topics)) {
        post.topics = post.topics ? [post.topics] : [];
    }

    // format the following options
    post.topics = post.topics.map(function(topic){
        return utils.fromAscii(topic);
    });

    return post; 
};

/**
 * Formats the output of a received post message
 *
 * @method outputPostFormatter
 * @param {Object}
 * @returns {Object}
 */
var outputPostFormatter = function(post){

    post.expiry = utils.toDecimal(post.expiry);
    post.sent = utils.toDecimal(post.sent);
    post.ttl = utils.toDecimal(post.ttl);
    post.workProved = utils.toDecimal(post.workProved);
    post.payloadRaw = post.payload;
    post.payload = utils.toAscii(post.payload);

    if (utils.isJson(post.payload)) {
        post.payload = JSON.parse(post.payload);
    }

    // format the following options
    if (!post.topics) {
        post.topics = [];
    }
    post.topics = post.topics.map(function(topic){
        return utils.toAscii(topic);
    });

    return post;
};

module.exports = {
    inputDefaultBlockNumberFormatter: inputDefaultBlockNumberFormatter,
    inputBlockNumberFormatter: inputBlockNumberFormatter,
    inputTransactionFormatter: inputTransactionFormatter,
    inputPostFormatter: inputPostFormatter,
    outputBigNumberFormatter: outputBigNumberFormatter,
    outputTransactionFormatter: outputTransactionFormatter,
    outputBlockFormatter: outputBlockFormatter,
    outputLogFormatter: outputLogFormatter,
    outputPostFormatter: outputPostFormatter
};


},{"../utils/config":5,"../utils/utils":6}],17:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file function.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var web3 = require('../web3');
var coder = require('../solidity/coder');
var utils = require('../utils/utils');

/**
 * This prototype should be used to call/sendTransaction to solidity functions
 */
var SolidityFunction = function (json, address) {
    this._inputTypes = json.inputs.map(function (i) {
        return i.type;
    });
    this._outputTypes = json.outputs.map(function (i) {
        return i.type;
    });
    this._constant = json.constant;
    this._name = utils.transformToFullName(json);
    this._address = address;
};

SolidityFunction.prototype.extractCallback = function (args) {
    if (utils.isFunction(args[args.length - 1])) {
        return args.pop(); // modify the args array!
    }
};

/**
 * Should be used to create payload from arguments
 *
 * @method toPayload
 * @param {Array} solidity function params
 * @param {Object} optional payload options
 * @param {Function} optional callback function to use asynchronous requests.
 */
SolidityFunction.prototype.toPayload = function (args, callback) {
    var options = {};
    if (args.length > this._inputTypes.length && utils.isObject(args[args.length -1])) {
        options = args[args.length - 1];
    }

    options.to = this._address;

    var self = this;
    if (callback != null) {
        this.signature(function(error, signature) {
            if (error == null) {
                options.data = '0x' + signature + coder.encodeParams(self._inputTypes, args);
            }
            
            callback(error, options);
        });

        return; 
    }

    options.data = '0x' + this.signature() + coder.encodeParams(this._inputTypes, args);
    return options;
};

/**
 * Should be used to get function signature
 *
 * @method signature
 * @param {Function} optional callback function to use asynchronous requests.
 * @return {String} function signature
 */
SolidityFunction.prototype.signature = function (callback) {
    if (callback != null) {
        web3.sha3(web3.fromAscii(this._name), function(error, result) {
            if (error == null) {
                result = result.slice(2, 10);
            }
            callback(error, result);
        });
    } else {
        return web3.sha3(web3.fromAscii(this._name)).slice(2, 10);
    }
};


SolidityFunction.prototype.unpackOutput = function (output) {
    if (output === null) {
        return;
    }

    output = output.length >= 2 ? output.slice(2) : output;
    var result = coder.decodeParams(this._outputTypes, output);
    return result.length === 1 ? result[0] : result;
};

/**
 * Calls a contract function.
 *
 * @method call
 * @param {...Object} Contract function arguments
 * @param {function} If the last argument is a function, the contract function
 *   call will be asynchronous, and the callback will be passed the
 *   error and result.
 * @return {String} output bytes
 */
SolidityFunction.prototype.call = function () {
    var args = Array.prototype.slice.call(arguments);
    var callback = this.extractCallback(args);

    if (!callback) {
        var payload = this.toPayload(args);
        var output = web3.eth.call(payload);
        return this.unpackOutput(output);
    } 
        
    var self = this;
    this.toPayload(args, function(error, payload) {
        if (error != null) {
            callback(error, payload);
            return;
        }

        web3.eth.call(payload, function (error, output) {
            callback(error, self.unpackOutput(output));
        });
    });
};

/**
 * Should be used to sendTransaction to solidity function
 *
 * @method sendTransaction
 * @param {Object} options
 */
SolidityFunction.prototype.sendTransaction = function () {
    var args = Array.prototype.slice.call(arguments);
    var callback = this.extractCallback(args);

    if (!callback) {
        var payload = this.toPayload(args);
        web3.eth.sendTransaction(payload);
        return;
    }

    this.toPayload(args, function(error, payload) {
        if (error != null) {
            callback(error, payload);
            return;
        }

        web3.eth.sendTransaction(payload, callback);
    });
};

/**
 * Should be used to get function display name
 *
 * @method displayName
 * @return {String} display name of the function
 */
SolidityFunction.prototype.displayName = function () {
    return utils.extractDisplayName(this._name);
};

/**
 * Should be used to get function type name
 *
 * @method typeName
 * @return {String} type name of the function
 */
SolidityFunction.prototype.typeName = function () {
    return utils.extractTypeName(this._name);
};

/**
 * Should be called to get rpc requests from solidity function
 *
 * @method request
 * @returns {Object}
 */
SolidityFunction.prototype.request = function () {
    var args = Array.prototype.slice.call(arguments);
    var callback = this.extractCallback(args);
    var payload = this.toPayload(args);
    var format = this.unpackOutput.bind(this);
    
    return {
        callback: callback,
        payload: payload, 
        format: format
    };
};

/**
 * Should be called to execute function
 *
 * @method execute
 */
SolidityFunction.prototype.execute = function () {
    var transaction = !this._constant;

    // send transaction
    if (transaction) {
        return this.sendTransaction.apply(this, Array.prototype.slice.call(arguments));
    }

    // call
    return this.call.apply(this, Array.prototype.slice.call(arguments));
};

/**
 * Should be called to attach function to contract
 *
 * @method attachToContract
 * @param {Contract}
 */
SolidityFunction.prototype.attachToContract = function (contract) {
    var execute = this.execute.bind(this);
    execute.request = this.request.bind(this);
    execute.call = this.call.bind(this);
    execute.sendTransaction = this.sendTransaction.bind(this);
    var displayName = this.displayName();
    if (!contract[displayName]) {
        contract[displayName] = execute;
    }
    contract[displayName][this.typeName()] = execute; // circular!!!!
};

module.exports = SolidityFunction;


},{"../solidity/coder":1,"../utils/utils":6,"../web3":8}],18:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file httpprovider.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 *   Fabian Vogelsteller <fabian@ethdev.com>
 * @date 2014
 */

"use strict";

var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest; // jshint ignore:line
var errors = require('./errors');

var HttpProvider = function (host) {
    this.host = host || 'http://localhost:8545';
};

HttpProvider.prototype.send = function (payload) {
    var request = new XMLHttpRequest();

    request.open('POST', this.host, false);
    
    try {
        request.send(JSON.stringify(payload));
    } catch(error) {
        throw errors.InvalidConnection(this.host);
    }


    // check request.status
    // TODO: throw an error here! it cannot silently fail!!!
    //if (request.status !== 200) {
        //return;
    //}

    var result = request.responseText;

    try {
        result = JSON.parse(result);
    } catch(e) {
        throw errors.InvalidResponse(result);                
    }

    return result;
};

HttpProvider.prototype.sendAsync = function (payload, callback) {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
        if (request.readyState === 4) {
            var result = request.responseText;
            var error = null;

            try {
                result = JSON.parse(result);
            } catch(e) {
                error = errors.InvalidResponse(result);                
            }

            callback(error, result);
        }
    };

    request.open('POST', this.host, true);

    try {
        request.send(JSON.stringify(payload));
    } catch(error) {
        callback(errors.InvalidConnection(this.host));
    }
};

module.exports = HttpProvider;


},{"./errors":12,"xmlhttprequest":4}],19:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file jsonrpc.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Jsonrpc = function () {
    // singleton pattern
    if (arguments.callee._singletonInstance) {
        return arguments.callee._singletonInstance;
    }
    arguments.callee._singletonInstance = this;

    this.messageId = 1;
};

/**
 * @return {Jsonrpc} singleton
 */
Jsonrpc.getInstance = function () {
    var instance = new Jsonrpc();
    return instance;
};

/**
 * Should be called to valid json create payload object
 *
 * @method toPayload
 * @param {Function} method of jsonrpc call, required
 * @param {Array} params, an array of method params, optional
 * @returns {Object} valid jsonrpc payload object
 */
Jsonrpc.prototype.toPayload = function (method, params) {
    if (!method)
        console.error('jsonrpc method should be specified!');

    return {
        jsonrpc: '2.0',
        method: method,
        params: params || [],
        id: this.messageId++
    };
};

/**
 * Should be called to check if jsonrpc response is valid
 *
 * @method isValidResponse
 * @param {Object}
 * @returns {Boolean} true if response is valid, otherwise false
 */
Jsonrpc.prototype.isValidResponse = function (response) {
    return !!response &&
        !response.error &&
        response.jsonrpc === '2.0' &&
        typeof response.id === 'number' &&
        response.result !== undefined; // only undefined is not valid json object
};

/**
 * Should be called to create batch payload object
 *
 * @method toBatchPayload
 * @param {Array} messages, an array of objects with method (required) and params (optional) fields
 * @returns {Array} batch payload
 */
Jsonrpc.prototype.toBatchPayload = function (messages) {
    var self = this;
    return messages.map(function (message) {
        return self.toPayload(message.method, message.params);
    });
};

module.exports = Jsonrpc;


},{}],20:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file method.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var RequestManager = require('./requestmanager');
var utils = require('../utils/utils');
var errors = require('./errors');

var Method = function (options) {
    this.name = options.name;
    this.call = options.call;
    this.params = options.params || 0;
    this.inputFormatter = options.inputFormatter;
    this.outputFormatter = options.outputFormatter;
};

/**
 * Should be used to determine name of the jsonrpc method based on arguments
 *
 * @method getCall
 * @param {Array} arguments
 * @return {String} name of jsonrpc method
 */
Method.prototype.getCall = function (args) {
    return utils.isFunction(this.call) ? this.call(args) : this.call;
};

/**
 * Should be used to extract callback from array of arguments. Modifies input param
 *
 * @method extractCallback
 * @param {Array} arguments
 * @return {Function|Null} callback, if exists
 */
Method.prototype.extractCallback = function (args) {
    if (utils.isFunction(args[args.length - 1])) {
        return args.pop(); // modify the args array!
    }
};

/**
 * Should be called to check if the number of arguments is correct
 * 
 * @method validateArgs
 * @param {Array} arguments
 * @throws {Error} if it is not
 */
Method.prototype.validateArgs = function (args) {
    if (args.length !== this.params) {
        throw errors.InvalidNumberOfParams();
    }
};

/**
 * Should be called to format input args of method
 * 
 * @method formatInput
 * @param {Array}
 * @return {Array}
 */
Method.prototype.formatInput = function (args) {
    if (!this.inputFormatter) {
        return args;
    }

    return this.inputFormatter.map(function (formatter, index) {
        return formatter ? formatter(args[index]) : args[index];
    });
};

/**
 * Should be called to format output(result) of method
 *
 * @method formatOutput
 * @param {Object}
 * @return {Object}
 */
Method.prototype.formatOutput = function (result) {
    return this.outputFormatter && result !== null ? this.outputFormatter(result) : result;
};

/**
 * Should attach function to method
 * 
 * @method attachToObject
 * @param {Object}
 * @param {Function}
 */
Method.prototype.attachToObject = function (obj) {
    var func = this.send.bind(this);
    func.request = this.request.bind(this);
    func.call = this.call; // that's ugly. filter.js uses it
    var name = this.name.split('.');
    if (name.length > 1) {
        obj[name[0]] = obj[name[0]] || {};
        obj[name[0]][name[1]] = func;
    } else {
        obj[name[0]] = func; 
    }
};

/**
 * Should create payload from given input args
 *
 * @method toPayload
 * @param {Array} args
 * @return {Object}
 */
Method.prototype.toPayload = function (args) {
    var call = this.getCall(args);
    var callback = this.extractCallback(args);
    var params = this.formatInput(args);
    this.validateArgs(params);

    return {
        method: call,
        params: params,
        callback: callback
    };
};

/**
 * Should be called to create pure JSONRPC request which can be used in batch request
 *
 * @method request
 * @param {...} params
 * @return {Object} jsonrpc request
 */
Method.prototype.request = function () {
    var payload = this.toPayload(Array.prototype.slice.call(arguments));
    payload.format = this.formatOutput.bind(this);
    return payload;
};

/**
 * Should send request to the API
 *
 * @method send
 * @param list of params
 * @return result
 */
Method.prototype.send = function () {
    var payload = this.toPayload(Array.prototype.slice.call(arguments));
    if (payload.callback) {
        var self = this;
        return RequestManager.getInstance().sendAsync(payload, function (err, result) {
            payload.callback(err, self.formatOutput(result));
        });
    }
    return this.formatOutput(RequestManager.getInstance().send(payload));
};

module.exports = Method;


},{"../utils/utils":6,"./errors":12,"./requestmanager":24}],21:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file eth.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var utils = require('../utils/utils');
var Property = require('./property');

/// @returns an array of objects describing web3.eth api methods
var methods = [
];

/// @returns an array of objects describing web3.eth api properties
var properties = [
    new Property({
        name: 'listening',
        getter: 'net_listening'
    }),
    new Property({
        name: 'peerCount',
        getter: 'net_peerCount',
        outputFormatter: utils.toDecimal
    })
];


module.exports = {
    methods: methods,
    properties: properties
};


},{"../utils/utils":6,"./property":22}],22:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file property.js
 * @author Fabian Vogelsteller <fabian@frozeman.de>
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var RequestManager = require('./requestmanager');

var Property = function (options) {
    this.name = options.name;
    this.getter = options.getter;
    this.setter = options.setter;
    this.outputFormatter = options.outputFormatter;
    this.inputFormatter = options.inputFormatter;
};

/**
 * Should be called to format input args of method
 * 
 * @method formatInput
 * @param {Array}
 * @return {Array}
 */
Property.prototype.formatInput = function (arg) {
    return this.inputFormatter ? this.inputFormatter(arg) : arg;
};

/**
 * Should be called to format output(result) of method
 *
 * @method formatOutput
 * @param {Object}
 * @return {Object}
 */
Property.prototype.formatOutput = function (result) {
    return this.outputFormatter && result !== null ? this.outputFormatter(result) : result;
};

/**
 * Should attach function to method
 * 
 * @method attachToObject
 * @param {Object}
 * @param {Function}
 */
Property.prototype.attachToObject = function (obj) {
    var proto = {
        get: this.get.bind(this),
    };

    var names = this.name.split('.');
    var name = names[0];
    if (names.length > 1) {
        obj[names[0]] = obj[names[0]] || {};
        obj = obj[names[0]];
        name = names[1];
    }
    
    Object.defineProperty(obj, name, proto);

    var toAsyncName = function (prefix, name) {
        return prefix + name.charAt(0).toUpperCase() + name.slice(1);
    };

    obj[toAsyncName('get', name)] = this.getAsync.bind(this);
};

/**
 * Should be used to get value of the property
 *
 * @method get
 * @return {Object} value of the property
 */
Property.prototype.get = function () {
    return this.formatOutput(RequestManager.getInstance().send({
        method: this.getter
    }));
};

/**
 * Should be used to asynchrounously get value of property
 *
 * @method getAsync
 * @param {Function}
 */
Property.prototype.getAsync = function (callback) {
    var self = this;
    RequestManager.getInstance().sendAsync({
        method: this.getter
    }, function (err, result) {
        if (err) {
            return callback(err);
        }
        callback(err, self.formatOutput(result));
    });
};

module.exports = Property;


},{"./requestmanager":24}],23:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file qtsync.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 * @date 2014
 */

var QtSyncProvider = function () {
};

QtSyncProvider.prototype.send = function (payload) {
    var result = navigator.qt.callMethod(JSON.stringify(payload));
    return JSON.parse(result);
};

module.exports = QtSyncProvider;


},{}],24:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file requestmanager.js
 * @author Jeffrey Wilcke <jeff@ethdev.com>
 * @author Marek Kotewicz <marek@ethdev.com>
 * @author Marian Oancea <marian@ethdev.com>
 * @author Fabian Vogelsteller <fabian@ethdev.com>
 * @author Gav Wood <g@ethdev.com>
 * @date 2014
 */

var Jsonrpc = require('./jsonrpc');
var utils = require('../utils/utils');
var c = require('../utils/config');
var errors = require('./errors');

/**
 * It's responsible for passing messages to providers
 * It's also responsible for polling the ethereum node for incoming messages
 * Default poll timeout is 1 second
 * Singleton
 */
var RequestManager = function (provider) {
    // singleton pattern
    if (arguments.callee._singletonInstance) {
        return arguments.callee._singletonInstance;
    }
    arguments.callee._singletonInstance = this;

    this.provider = provider;
    this.polls = [];
    this.timeout = null;
    this.poll();
};

/**
 * @return {RequestManager} singleton
 */
RequestManager.getInstance = function () {
    var instance = new RequestManager();
    return instance;
};

/**
 * Should be used to synchronously send request
 *
 * @method send
 * @param {Object} data
 * @return {Object}
 */
RequestManager.prototype.send = function (data) {
    if (!this.provider) {
        console.error(errors.InvalidProvider());
        return null;
    }

    var payload = Jsonrpc.getInstance().toPayload(data.method, data.params);
    var result = this.provider.send(payload);

    if (!Jsonrpc.getInstance().isValidResponse(result)) {
        throw errors.InvalidResponse(result);
    }

    return result.result;
};

/**
 * Should be used to asynchronously send request
 *
 * @method sendAsync
 * @param {Object} data
 * @param {Function} callback
 */
RequestManager.prototype.sendAsync = function (data, callback) {
    if (!this.provider) {
        return callback(errors.InvalidProvider());
    }

    var payload = Jsonrpc.getInstance().toPayload(data.method, data.params);
    this.provider.sendAsync(payload, function (err, result) {
        if (err) {
            return callback(err);
        }
        
        if (!Jsonrpc.getInstance().isValidResponse(result)) {
            return callback(errors.InvalidResponse(result));
        }

        callback(null, result.result);
    });
};

/**
 * Should be called to asynchronously send batch request
 *
 * @method sendBatch
 * @param {Array} batch data
 * @param {Function} callback
 */
RequestManager.prototype.sendBatch = function (data, callback) {
    if (!this.provider) {
        return callback(errors.InvalidProvider());
    }

    var payload = Jsonrpc.getInstance().toBatchPayload(data);

    this.provider.sendAsync(payload, function (err, results) {
        if (err) {
            return callback(err);
        }

        if (!utils.isArray(results)) {
            return callback(errors.InvalidResponse(results));
        }

        callback(err, results);
    }); 
};

/**
 * Should be used to set provider of request manager
 *
 * @method setProvider
 * @param {Object}
 */
RequestManager.prototype.setProvider = function (p) {
    this.provider = p;
};

/*jshint maxparams:4 */

/**
 * Should be used to start polling
 *
 * @method startPolling
 * @param {Object} data
 * @param {Number} pollId
 * @param {Function} callback
 * @param {Function} uninstall
 *
 * @todo cleanup number of params
 */
RequestManager.prototype.startPolling = function (data, pollId, callback, uninstall) {
    this.polls.push({data: data, id: pollId, callback: callback, uninstall: uninstall});
};
/*jshint maxparams:3 */

/**
 * Should be used to stop polling for filter with given id
 *
 * @method stopPolling
 * @param {Number} pollId
 */
RequestManager.prototype.stopPolling = function (pollId) {
    for (var i = this.polls.length; i--;) {
        var poll = this.polls[i];
        if (poll.id === pollId) {
            this.polls.splice(i, 1);
        }
    }
};

/**
 * Should be called to reset polling mechanism of request manager
 *
 * @method reset
 */
RequestManager.prototype.reset = function () {
    this.polls.forEach(function (poll) {
        poll.uninstall(poll.id); 
    });
    this.polls = [];

    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    }
    this.poll();
};

/**
 * Should be called to poll for changes on filter with given id
 *
 * @method poll
 */
RequestManager.prototype.poll = function () {
    this.timeout = setTimeout(this.poll.bind(this), c.ETH_POLLING_TIMEOUT);

    if (!this.polls.length) {
        return;
    }

    if (!this.provider) {
        console.error(errors.InvalidProvider());
        return;
    }

    var payload = Jsonrpc.getInstance().toBatchPayload(this.polls.map(function (data) {
        return data.data;
    }));

    var self = this;
    this.provider.sendAsync(payload, function (error, results) {
        // TODO: console log?
        if (error) {
            return;
        }
            
        if (!utils.isArray(results)) {
            throw errors.InvalidResponse(results);
        }

        results.map(function (result, index) {
            result.callback = self.polls[index].callback;
            return result;
        }).filter(function (result) {
            var valid = Jsonrpc.getInstance().isValidResponse(result);
            if (!valid) {
                result.callback(errors.InvalidResponse(result));
            }
            return valid;
        }).filter(function (result) {
            return utils.isArray(result.result) && result.result.length > 0;
        }).forEach(function (result) {
            result.callback(null, result.result);
        });
    });
};

module.exports = RequestManager;


},{"../utils/config":5,"../utils/utils":6,"./errors":12,"./jsonrpc":19}],25:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file shh.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Method = require('./method');
var formatters = require('./formatters');

var post = new Method({
    name: 'post', 
    call: 'shh_post', 
    params: 1,
    inputFormatter: [formatters.inputPostFormatter]
});

var newIdentity = new Method({
    name: 'newIdentity',
    call: 'shh_newIdentity',
    params: 0
});

var hasIdentity = new Method({
    name: 'hasIdentity',
    call: 'shh_hasIdentity',
    params: 1
});

var newGroup = new Method({
    name: 'newGroup',
    call: 'shh_newGroup',
    params: 0
});

var addToGroup = new Method({
    name: 'addToGroup',
    call: 'shh_addToGroup',
    params: 0
});

var methods = [
    post,
    newIdentity,
    hasIdentity,
    newGroup,
    addToGroup
];

module.exports = {
    methods: methods
};


},{"./formatters":16,"./method":20}],26:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file watches.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Method = require('./method');

/// @returns an array of objects describing web3.eth.filter api methods
var eth = function () {
    var newFilterCall = function (args) {
        var type = args[0];

        switch(type) {
            case 'latest':
                args.pop();
                this.params = 0;
                return 'eth_newBlockFilter';
            case 'pending':
                args.pop();
                this.params = 0;
                return 'eth_newPendingTransactionFilter';
            default:
                return 'eth_newFilter';
        }
    };

    var newFilter = new Method({
        name: 'newFilter',
        call: newFilterCall,
        params: 1
    });

    var uninstallFilter = new Method({
        name: 'uninstallFilter',
        call: 'eth_uninstallFilter',
        params: 1
    });

    var getLogs = new Method({
        name: 'getLogs',
        call: 'eth_getFilterLogs',
        params: 1
    });

    var poll = new Method({
        name: 'poll',
        call: 'eth_getFilterChanges',
        params: 1
    });

    return [
        newFilter,
        uninstallFilter,
        getLogs,
        poll
    ];
};

/// @returns an array of objects describing web3.shh.watch api methods
var shh = function () {
    var newFilter = new Method({
        name: 'newFilter',
        call: 'shh_newFilter',
        params: 1
    });

    var uninstallFilter = new Method({
        name: 'uninstallFilter',
        call: 'shh_uninstallFilter',
        params: 1
    });

    var getLogs = new Method({
        name: 'getLogs',
        call: 'shh_getMessages',
        params: 1
    });

    var poll = new Method({
        name: 'poll',
        call: 'shh_getFilterChanges',
        params: 1
    });

    return [
        newFilter,
        uninstallFilter,
        getLogs,
        poll
    ];
};

module.exports = {
    eth: eth,
    shh: shh
};


},{"./method":20}],27:[function(require,module,exports){

},{}],"bignumber.js":[function(require,module,exports){
/*! bignumber.js v2.0.7 https://github.com/MikeMcl/bignumber.js/LICENCE */

;(function (global) {
    'use strict';

    /*
      bignumber.js v2.0.7
      A JavaScript library for arbitrary-precision arithmetic.
      https://github.com/MikeMcl/bignumber.js
      Copyright (c) 2015 Michael Mclaughlin <M8ch88l@gmail.com>
      MIT Expat Licence
    */


    var BigNumber, crypto, parseNumeric,
        isNumeric = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i,
        mathceil = Math.ceil,
        mathfloor = Math.floor,
        notBool = ' not a boolean or binary digit',
        roundingMode = 'rounding mode',
        tooManyDigits = 'number type has more than 15 significant digits',
        ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_',
        BASE = 1e14,
        LOG_BASE = 14,
        MAX_SAFE_INTEGER = 0x1fffffffffffff,         // 2^53 - 1
        // MAX_INT32 = 0x7fffffff,                   // 2^31 - 1
        POWS_TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13],
        SQRT_BASE = 1e7,

        /*
         * The limit on the value of DECIMAL_PLACES, TO_EXP_NEG, TO_EXP_POS, MIN_EXP, MAX_EXP, and
         * the arguments to toExponential, toFixed, toFormat, and toPrecision, beyond which an
         * exception is thrown (if ERRORS is true).
         */
        MAX = 1E9;                                   // 0 to MAX_INT32


    /*
     * Create and return a BigNumber constructor.
     */
    function another(configObj) {
        var div,

            // id tracks the caller function, so its name can be included in error messages.
            id = 0,
            P = BigNumber.prototype,
            ONE = new BigNumber(1),


            /********************************* EDITABLE DEFAULTS **********************************/


            /*
             * The default values below must be integers within the inclusive ranges stated.
             * The values can also be changed at run-time using BigNumber.config.
             */

            // The maximum number of decimal places for operations involving division.
            DECIMAL_PLACES = 20,                     // 0 to MAX

            /*
             * The rounding mode used when rounding to the above decimal places, and when using
             * toExponential, toFixed, toFormat and toPrecision, and round (default value).
             * UP         0 Away from zero.
             * DOWN       1 Towards zero.
             * CEIL       2 Towards +Infinity.
             * FLOOR      3 Towards -Infinity.
             * HALF_UP    4 Towards nearest neighbour. If equidistant, up.
             * HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
             * HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
             * HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
             * HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
             */
            ROUNDING_MODE = 4,                       // 0 to 8

            // EXPONENTIAL_AT : [TO_EXP_NEG , TO_EXP_POS]

            // The exponent value at and beneath which toString returns exponential notation.
            // Number type: -7
            TO_EXP_NEG = -7,                         // 0 to -MAX

            // The exponent value at and above which toString returns exponential notation.
            // Number type: 21
            TO_EXP_POS = 21,                         // 0 to MAX

            // RANGE : [MIN_EXP, MAX_EXP]

            // The minimum exponent value, beneath which underflow to zero occurs.
            // Number type: -324  (5e-324)
            MIN_EXP = -1e7,                          // -1 to -MAX

            // The maximum exponent value, above which overflow to Infinity occurs.
            // Number type:  308  (1.7976931348623157e+308)
            // For MAX_EXP > 1e7, e.g. new BigNumber('1e100000000').plus(1) may be slow.
            MAX_EXP = 1e7,                           // 1 to MAX

            // Whether BigNumber Errors are ever thrown.
            ERRORS = true,                           // true or false

            // Change to intValidatorNoErrors if ERRORS is false.
            isValidInt = intValidatorWithErrors,     // intValidatorWithErrors/intValidatorNoErrors

            // Whether to use cryptographically-secure random number generation, if available.
            CRYPTO = false,                          // true or false

            /*
             * The modulo mode used when calculating the modulus: a mod n.
             * The quotient (q = a / n) is calculated according to the corresponding rounding mode.
             * The remainder (r) is calculated as: r = a - n * q.
             *
             * UP        0 The remainder is positive if the dividend is negative, else is negative.
             * DOWN      1 The remainder has the same sign as the dividend.
             *             This modulo mode is commonly known as 'truncated division' and is
             *             equivalent to (a % n) in JavaScript.
             * FLOOR     3 The remainder has the same sign as the divisor (Python %).
             * HALF_EVEN 6 This modulo mode implements the IEEE 754 remainder function.
             * EUCLID    9 Euclidian division. q = sign(n) * floor(a / abs(n)).
             *             The remainder is always positive.
             *
             * The truncated division, floored division, Euclidian division and IEEE 754 remainder
             * modes are commonly used for the modulus operation.
             * Although the other rounding modes can also be used, they may not give useful results.
             */
            MODULO_MODE = 1,                         // 0 to 9

            // The maximum number of significant digits of the result of the toPower operation.
            // If POW_PRECISION is 0, there will be unlimited significant digits.
            POW_PRECISION = 100,                     // 0 to MAX

            // The format specification used by the BigNumber.prototype.toFormat method.
            FORMAT = {
                decimalSeparator: '.',
                groupSeparator: ',',
                groupSize: 3,
                secondaryGroupSize: 0,
                fractionGroupSeparator: '\xA0',      // non-breaking space
                fractionGroupSize: 0
            };


        /******************************************************************************************/


        // CONSTRUCTOR


        /*
         * The BigNumber constructor and exported function.
         * Create and return a new instance of a BigNumber object.
         *
         * n {number|string|BigNumber} A numeric value.
         * [b] {number} The base of n. Integer, 2 to 64 inclusive.
         */
        function BigNumber( n, b ) {
            var c, e, i, num, len, str,
                x = this;

            // Enable constructor usage without new.
            if ( !( x instanceof BigNumber ) ) {

                // 'BigNumber() constructor call without new: {n}'
                if (ERRORS) raise( 26, 'constructor call without new', n );
                return new BigNumber( n, b );
            }

            // 'new BigNumber() base not an integer: {b}'
            // 'new BigNumber() base out of range: {b}'
            if ( b == null || !isValidInt( b, 2, 64, id, 'base' ) ) {

                // Duplicate.
                if ( n instanceof BigNumber ) {
                    x.s = n.s;
                    x.e = n.e;
                    x.c = ( n = n.c ) ? n.slice() : n;
                    id = 0;
                    return;
                }

                if ( ( num = typeof n == 'number' ) && n * 0 == 0 ) {
                    x.s = 1 / n < 0 ? ( n = -n, -1 ) : 1;

                    // Fast path for integers.
                    if ( n === ~~n ) {
                        for ( e = 0, i = n; i >= 10; i /= 10, e++ );
                        x.e = e;
                        x.c = [n];
                        id = 0;
                        return;
                    }

                    str = n + '';
                } else {
                    if ( !isNumeric.test( str = n + '' ) ) return parseNumeric( x, str, num );
                    x.s = str.charCodeAt(0) === 45 ? ( str = str.slice(1), -1 ) : 1;
                }
            } else {
                b = b | 0;
                str = n + '';

                // Ensure return value is rounded to DECIMAL_PLACES as with other bases.
                // Allow exponential notation to be used with base 10 argument.
                if ( b == 10 ) {
                    x = new BigNumber( n instanceof BigNumber ? n : str );
                    return round( x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE );
                }

                // Avoid potential interpretation of Infinity and NaN as base 44+ values.
                // Any number in exponential form will fail due to the [Ee][+-].
                if ( ( num = typeof n == 'number' ) && n * 0 != 0 ||
                  !( new RegExp( '^-?' + ( c = '[' + ALPHABET.slice( 0, b ) + ']+' ) +
                    '(?:\\.' + c + ')?$',b < 37 ? 'i' : '' ) ).test(str) ) {
                    return parseNumeric( x, str, num, b );
                }

                if (num) {
                    x.s = 1 / n < 0 ? ( str = str.slice(1), -1 ) : 1;

                    if ( ERRORS && str.replace( /^0\.0*|\./, '' ).length > 15 ) {

                        // 'new BigNumber() number type has more than 15 significant digits: {n}'
                        raise( id, tooManyDigits, n );
                    }

                    // Prevent later check for length on converted number.
                    num = false;
                } else {
                    x.s = str.charCodeAt(0) === 45 ? ( str = str.slice(1), -1 ) : 1;
                }

                str = convertBase( str, 10, b, x.s );
            }

            // Decimal point?
            if ( ( e = str.indexOf('.') ) > -1 ) str = str.replace( '.', '' );

            // Exponential form?
            if ( ( i = str.search( /e/i ) ) > 0 ) {

                // Determine exponent.
                if ( e < 0 ) e = i;
                e += +str.slice( i + 1 );
                str = str.substring( 0, i );
            } else if ( e < 0 ) {

                // Integer.
                e = str.length;
            }

            // Determine leading zeros.
            for ( i = 0; str.charCodeAt(i) === 48; i++ );

            // Determine trailing zeros.
            for ( len = str.length; str.charCodeAt(--len) === 48; );
            str = str.slice( i, len + 1 );

            if (str) {
                len = str.length;

                // Disallow numbers with over 15 significant digits if number type.
                // 'new BigNumber() number type has more than 15 significant digits: {n}'
                if ( num && ERRORS && len > 15 ) raise( id, tooManyDigits, x.s * n );

                e = e - i - 1;

                 // Overflow?
                if ( e > MAX_EXP ) {

                    // Infinity.
                    x.c = x.e = null;

                // Underflow?
                } else if ( e < MIN_EXP ) {

                    // Zero.
                    x.c = [ x.e = 0 ];
                } else {
                    x.e = e;
                    x.c = [];

                    // Transform base

                    // e is the base 10 exponent.
                    // i is where to slice str to get the first element of the coefficient array.
                    i = ( e + 1 ) % LOG_BASE;
                    if ( e < 0 ) i += LOG_BASE;

                    if ( i < len ) {
                        if (i) x.c.push( +str.slice( 0, i ) );

                        for ( len -= LOG_BASE; i < len; ) {
                            x.c.push( +str.slice( i, i += LOG_BASE ) );
                        }

                        str = str.slice(i);
                        i = LOG_BASE - str.length;
                    } else {
                        i -= len;
                    }

                    for ( ; i--; str += '0' );
                    x.c.push( +str );
                }
            } else {

                // Zero.
                x.c = [ x.e = 0 ];
            }

            id = 0;
        }


        // CONSTRUCTOR PROPERTIES


        BigNumber.another = another;

        BigNumber.ROUND_UP = 0;
        BigNumber.ROUND_DOWN = 1;
        BigNumber.ROUND_CEIL = 2;
        BigNumber.ROUND_FLOOR = 3;
        BigNumber.ROUND_HALF_UP = 4;
        BigNumber.ROUND_HALF_DOWN = 5;
        BigNumber.ROUND_HALF_EVEN = 6;
        BigNumber.ROUND_HALF_CEIL = 7;
        BigNumber.ROUND_HALF_FLOOR = 8;
        BigNumber.EUCLID = 9;


        /*
         * Configure infrequently-changing library-wide settings.
         *
         * Accept an object or an argument list, with one or many of the following properties or
         * parameters respectively:
         *
         *   DECIMAL_PLACES  {number}  Integer, 0 to MAX inclusive
         *   ROUNDING_MODE   {number}  Integer, 0 to 8 inclusive
         *   EXPONENTIAL_AT  {number|number[]}  Integer, -MAX to MAX inclusive or
         *                                      [integer -MAX to 0 incl., 0 to MAX incl.]
         *   RANGE           {number|number[]}  Non-zero integer, -MAX to MAX inclusive or
         *                                      [integer -MAX to -1 incl., integer 1 to MAX incl.]
         *   ERRORS          {boolean|number}   true, false, 1 or 0
         *   CRYPTO          {boolean|number}   true, false, 1 or 0
         *   MODULO_MODE     {number}           0 to 9 inclusive
         *   POW_PRECISION   {number}           0 to MAX inclusive
         *   FORMAT          {object}           See BigNumber.prototype.toFormat
         *      decimalSeparator       {string}
         *      groupSeparator         {string}
         *      groupSize              {number}
         *      secondaryGroupSize     {number}
         *      fractionGroupSeparator {string}
         *      fractionGroupSize      {number}
         *
         * (The values assigned to the above FORMAT object properties are not checked for validity.)
         *
         * E.g.
         * BigNumber.config(20, 4) is equivalent to
         * BigNumber.config({ DECIMAL_PLACES : 20, ROUNDING_MODE : 4 })
         *
         * Ignore properties/parameters set to null or undefined.
         * Return an object with the properties current values.
         */
        BigNumber.config = function () {
            var v, p,
                i = 0,
                r = {},
                a = arguments,
                o = a[0],
                has = o && typeof o == 'object'
                  ? function () { if ( o.hasOwnProperty(p) ) return ( v = o[p] ) != null; }
                  : function () { if ( a.length > i ) return ( v = a[i++] ) != null; };

            // DECIMAL_PLACES {number} Integer, 0 to MAX inclusive.
            // 'config() DECIMAL_PLACES not an integer: {v}'
            // 'config() DECIMAL_PLACES out of range: {v}'
            if ( has( p = 'DECIMAL_PLACES' ) && isValidInt( v, 0, MAX, 2, p ) ) {
                DECIMAL_PLACES = v | 0;
            }
            r[p] = DECIMAL_PLACES;

            // ROUNDING_MODE {number} Integer, 0 to 8 inclusive.
            // 'config() ROUNDING_MODE not an integer: {v}'
            // 'config() ROUNDING_MODE out of range: {v}'
            if ( has( p = 'ROUNDING_MODE' ) && isValidInt( v, 0, 8, 2, p ) ) {
                ROUNDING_MODE = v | 0;
            }
            r[p] = ROUNDING_MODE;

            // EXPONENTIAL_AT {number|number[]}
            // Integer, -MAX to MAX inclusive or [integer -MAX to 0 inclusive, 0 to MAX inclusive].
            // 'config() EXPONENTIAL_AT not an integer: {v}'
            // 'config() EXPONENTIAL_AT out of range: {v}'
            if ( has( p = 'EXPONENTIAL_AT' ) ) {

                if ( isArray(v) ) {
                    if ( isValidInt( v[0], -MAX, 0, 2, p ) && isValidInt( v[1], 0, MAX, 2, p ) ) {
                        TO_EXP_NEG = v[0] | 0;
                        TO_EXP_POS = v[1] | 0;
                    }
                } else if ( isValidInt( v, -MAX, MAX, 2, p ) ) {
                    TO_EXP_NEG = -( TO_EXP_POS = ( v < 0 ? -v : v ) | 0 );
                }
            }
            r[p] = [ TO_EXP_NEG, TO_EXP_POS ];

            // RANGE {number|number[]} Non-zero integer, -MAX to MAX inclusive or
            // [integer -MAX to -1 inclusive, integer 1 to MAX inclusive].
            // 'config() RANGE not an integer: {v}'
            // 'config() RANGE cannot be zero: {v}'
            // 'config() RANGE out of range: {v}'
            if ( has( p = 'RANGE' ) ) {

                if ( isArray(v) ) {
                    if ( isValidInt( v[0], -MAX, -1, 2, p ) && isValidInt( v[1], 1, MAX, 2, p ) ) {
                        MIN_EXP = v[0] | 0;
                        MAX_EXP = v[1] | 0;
                    }
                } else if ( isValidInt( v, -MAX, MAX, 2, p ) ) {
                    if ( v | 0 ) MIN_EXP = -( MAX_EXP = ( v < 0 ? -v : v ) | 0 );
                    else if (ERRORS) raise( 2, p + ' cannot be zero', v );
                }
            }
            r[p] = [ MIN_EXP, MAX_EXP ];

            // ERRORS {boolean|number} true, false, 1 or 0.
            // 'config() ERRORS not a boolean or binary digit: {v}'
            if ( has( p = 'ERRORS' ) ) {

                if ( v === !!v || v === 1 || v === 0 ) {
                    id = 0;
                    isValidInt = ( ERRORS = !!v ) ? intValidatorWithErrors : intValidatorNoErrors;
                } else if (ERRORS) {
                    raise( 2, p + notBool, v );
                }
            }
            r[p] = ERRORS;

            // CRYPTO {boolean|number} true, false, 1 or 0.
            // 'config() CRYPTO not a boolean or binary digit: {v}'
            // 'config() crypto unavailable: {crypto}'
            if ( has( p = 'CRYPTO' ) ) {

                if ( v === !!v || v === 1 || v === 0 ) {
                    CRYPTO = !!( v && crypto && typeof crypto == 'object' );
                    if ( v && !CRYPTO && ERRORS ) raise( 2, 'crypto unavailable', crypto );
                } else if (ERRORS) {
                    raise( 2, p + notBool, v );
                }
            }
            r[p] = CRYPTO;

            // MODULO_MODE {number} Integer, 0 to 9 inclusive.
            // 'config() MODULO_MODE not an integer: {v}'
            // 'config() MODULO_MODE out of range: {v}'
            if ( has( p = 'MODULO_MODE' ) && isValidInt( v, 0, 9, 2, p ) ) {
                MODULO_MODE = v | 0;
            }
            r[p] = MODULO_MODE;

            // POW_PRECISION {number} Integer, 0 to MAX inclusive.
            // 'config() POW_PRECISION not an integer: {v}'
            // 'config() POW_PRECISION out of range: {v}'
            if ( has( p = 'POW_PRECISION' ) && isValidInt( v, 0, MAX, 2, p ) ) {
                POW_PRECISION = v | 0;
            }
            r[p] = POW_PRECISION;

            // FORMAT {object}
            // 'config() FORMAT not an object: {v}'
            if ( has( p = 'FORMAT' ) ) {

                if ( typeof v == 'object' ) {
                    FORMAT = v;
                } else if (ERRORS) {
                    raise( 2, p + ' not an object', v );
                }
            }
            r[p] = FORMAT;

            return r;
        };


        /*
         * Return a new BigNumber whose value is the maximum of the arguments.
         *
         * arguments {number|string|BigNumber}
         */
        BigNumber.max = function () { return maxOrMin( arguments, P.lt ); };


        /*
         * Return a new BigNumber whose value is the minimum of the arguments.
         *
         * arguments {number|string|BigNumber}
         */
        BigNumber.min = function () { return maxOrMin( arguments, P.gt ); };


        /*
         * Return a new BigNumber with a random value equal to or greater than 0 and less than 1,
         * and with dp, or DECIMAL_PLACES if dp is omitted, decimal places (or less if trailing
         * zeros are produced).
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         *
         * 'random() decimal places not an integer: {dp}'
         * 'random() decimal places out of range: {dp}'
         * 'random() crypto unavailable: {crypto}'
         */
        BigNumber.random = (function () {
            var pow2_53 = 0x20000000000000;

            // Return a 53 bit integer n, where 0 <= n < 9007199254740992.
            // Check if Math.random() produces more than 32 bits of randomness.
            // If it does, assume at least 53 bits are produced, otherwise assume at least 30 bits.
            // 0x40000000 is 2^30, 0x800000 is 2^23, 0x1fffff is 2^21 - 1.
            var random53bitInt = (Math.random() * pow2_53) & 0x1fffff
              ? function () { return mathfloor( Math.random() * pow2_53 ); }
              : function () { return ((Math.random() * 0x40000000 | 0) * 0x800000) +
                  (Math.random() * 0x800000 | 0); };

            return function (dp) {
                var a, b, e, k, v,
                    i = 0,
                    c = [],
                    rand = new BigNumber(ONE);

                dp = dp == null || !isValidInt( dp, 0, MAX, 14 ) ? DECIMAL_PLACES : dp | 0;
                k = mathceil( dp / LOG_BASE );

                if (CRYPTO) {

                    // Browsers supporting crypto.getRandomValues.
                    if ( crypto && crypto.getRandomValues ) {

                        a = crypto.getRandomValues( new Uint32Array( k *= 2 ) );

                        for ( ; i < k; ) {

                            // 53 bits:
                            // ((Math.pow(2, 32) - 1) * Math.pow(2, 21)).toString(2)
                            // 11111 11111111 11111111 11111111 11100000 00000000 00000000
                            // ((Math.pow(2, 32) - 1) >>> 11).toString(2)
                            //                                     11111 11111111 11111111
                            // 0x20000 is 2^21.
                            v = a[i] * 0x20000 + (a[i + 1] >>> 11);

                            // Rejection sampling:
                            // 0 <= v < 9007199254740992
                            // Probability that v >= 9e15, is
                            // 7199254740992 / 9007199254740992 ~= 0.0008, i.e. 1 in 1251
                            if ( v >= 9e15 ) {
                                b = crypto.getRandomValues( new Uint32Array(2) );
                                a[i] = b[0];
                                a[i + 1] = b[1];
                            } else {

                                // 0 <= v <= 8999999999999999
                                // 0 <= (v % 1e14) <= 99999999999999
                                c.push( v % 1e14 );
                                i += 2;
                            }
                        }
                        i = k / 2;

                    // Node.js supporting crypto.randomBytes.
                    } else if ( crypto && crypto.randomBytes ) {

                        // buffer
                        a = crypto.randomBytes( k *= 7 );

                        for ( ; i < k; ) {

                            // 0x1000000000000 is 2^48, 0x10000000000 is 2^40
                            // 0x100000000 is 2^32, 0x1000000 is 2^24
                            // 11111 11111111 11111111 11111111 11111111 11111111 11111111
                            // 0 <= v < 9007199254740992
                            v = ( ( a[i] & 31 ) * 0x1000000000000 ) + ( a[i + 1] * 0x10000000000 ) +
                                  ( a[i + 2] * 0x100000000 ) + ( a[i + 3] * 0x1000000 ) +
                                  ( a[i + 4] << 16 ) + ( a[i + 5] << 8 ) + a[i + 6];

                            if ( v >= 9e15 ) {
                                crypto.randomBytes(7).copy( a, i );
                            } else {

                                // 0 <= (v % 1e14) <= 99999999999999
                                c.push( v % 1e14 );
                                i += 7;
                            }
                        }
                        i = k / 7;
                    } else if (ERRORS) {
                        raise( 14, 'crypto unavailable', crypto );
                    }
                }

                // Use Math.random: CRYPTO is false or crypto is unavailable and ERRORS is false.
                if (!i) {

                    for ( ; i < k; ) {
                        v = random53bitInt();
                        if ( v < 9e15 ) c[i++] = v % 1e14;
                    }
                }

                k = c[--i];
                dp %= LOG_BASE;

                // Convert trailing digits to zeros according to dp.
                if ( k && dp ) {
                    v = POWS_TEN[LOG_BASE - dp];
                    c[i] = mathfloor( k / v ) * v;
                }

                // Remove trailing elements which are zero.
                for ( ; c[i] === 0; c.pop(), i-- );

                // Zero?
                if ( i < 0 ) {
                    c = [ e = 0 ];
                } else {

                    // Remove leading elements which are zero and adjust exponent accordingly.
                    for ( e = -1 ; c[0] === 0; c.shift(), e -= LOG_BASE);

                    // Count the digits of the first element of c to determine leading zeros, and...
                    for ( i = 1, v = c[0]; v >= 10; v /= 10, i++);

                    // adjust the exponent accordingly.
                    if ( i < LOG_BASE ) e -= LOG_BASE - i;
                }

                rand.e = e;
                rand.c = c;
                return rand;
            };
        })();


        // PRIVATE FUNCTIONS


        // Convert a numeric string of baseIn to a numeric string of baseOut.
        function convertBase( str, baseOut, baseIn, sign ) {
            var d, e, k, r, x, xc, y,
                i = str.indexOf( '.' ),
                dp = DECIMAL_PLACES,
                rm = ROUNDING_MODE;

            if ( baseIn < 37 ) str = str.toLowerCase();

            // Non-integer.
            if ( i >= 0 ) {
                k = POW_PRECISION;

                // Unlimited precision.
                POW_PRECISION = 0;
                str = str.replace( '.', '' );
                y = new BigNumber(baseIn);
                x = y.pow( str.length - i );
                POW_PRECISION = k;

                // Convert str as if an integer, then restore the fraction part by dividing the
                // result by its base raised to a power.
                y.c = toBaseOut( toFixedPoint( coeffToString( x.c ), x.e ), 10, baseOut );
                y.e = y.c.length;
            }

            // Convert the number as integer.
            xc = toBaseOut( str, baseIn, baseOut );
            e = k = xc.length;

            // Remove trailing zeros.
            for ( ; xc[--k] == 0; xc.pop() );
            if ( !xc[0] ) return '0';

            if ( i < 0 ) {
                --e;
            } else {
                x.c = xc;
                x.e = e;

                // sign is needed for correct rounding.
                x.s = sign;
                x = div( x, y, dp, rm, baseOut );
                xc = x.c;
                r = x.r;
                e = x.e;
            }

            d = e + dp + 1;

            // The rounding digit, i.e. the digit to the right of the digit that may be rounded up.
            i = xc[d];
            k = baseOut / 2;
            r = r || d < 0 || xc[d + 1] != null;

            r = rm < 4 ? ( i != null || r ) && ( rm == 0 || rm == ( x.s < 0 ? 3 : 2 ) )
                       : i > k || i == k &&( rm == 4 || r || rm == 6 && xc[d - 1] & 1 ||
                         rm == ( x.s < 0 ? 8 : 7 ) );

            if ( d < 1 || !xc[0] ) {

                // 1^-dp or 0.
                str = r ? toFixedPoint( '1', -dp ) : '0';
            } else {
                xc.length = d;

                if (r) {

                    // Rounding up may mean the previous digit has to be rounded up and so on.
                    for ( --baseOut; ++xc[--d] > baseOut; ) {
                        xc[d] = 0;

                        if ( !d ) {
                            ++e;
                            xc.unshift(1);
                        }
                    }
                }

                // Determine trailing zeros.
                for ( k = xc.length; !xc[--k]; );

                // E.g. [4, 11, 15] becomes 4bf.
                for ( i = 0, str = ''; i <= k; str += ALPHABET.charAt( xc[i++] ) );
                str = toFixedPoint( str, e );
            }

            // The caller will add the sign.
            return str;
        }


        // Perform division in the specified base. Called by div and convertBase.
        div = (function () {

            // Assume non-zero x and k.
            function multiply( x, k, base ) {
                var m, temp, xlo, xhi,
                    carry = 0,
                    i = x.length,
                    klo = k % SQRT_BASE,
                    khi = k / SQRT_BASE | 0;

                for ( x = x.slice(); i--; ) {
                    xlo = x[i] % SQRT_BASE;
                    xhi = x[i] / SQRT_BASE | 0;
                    m = khi * xlo + xhi * klo;
                    temp = klo * xlo + ( ( m % SQRT_BASE ) * SQRT_BASE ) + carry;
                    carry = ( temp / base | 0 ) + ( m / SQRT_BASE | 0 ) + khi * xhi;
                    x[i] = temp % base;
                }

                if (carry) x.unshift(carry);

                return x;
            }

            function compare( a, b, aL, bL ) {
                var i, cmp;

                if ( aL != bL ) {
                    cmp = aL > bL ? 1 : -1;
                } else {

                    for ( i = cmp = 0; i < aL; i++ ) {

                        if ( a[i] != b[i] ) {
                            cmp = a[i] > b[i] ? 1 : -1;
                            break;
                        }
                    }
                }
                return cmp;
            }

            function subtract( a, b, aL, base ) {
                var i = 0;

                // Subtract b from a.
                for ( ; aL--; ) {
                    a[aL] -= i;
                    i = a[aL] < b[aL] ? 1 : 0;
                    a[aL] = i * base + a[aL] - b[aL];
                }

                // Remove leading zeros.
                for ( ; !a[0] && a.length > 1; a.shift() );
            }

            // x: dividend, y: divisor.
            return function ( x, y, dp, rm, base ) {
                var cmp, e, i, more, n, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0,
                    yL, yz,
                    s = x.s == y.s ? 1 : -1,
                    xc = x.c,
                    yc = y.c;

                // Either NaN, Infinity or 0?
                if ( !xc || !xc[0] || !yc || !yc[0] ) {

                    return new BigNumber(

                      // Return NaN if either NaN, or both Infinity or 0.
                      !x.s || !y.s || ( xc ? yc && xc[0] == yc[0] : !yc ) ? NaN :

                        // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
                        xc && xc[0] == 0 || !yc ? s * 0 : s / 0
                    );
                }

                q = new BigNumber(s);
                qc = q.c = [];
                e = x.e - y.e;
                s = dp + e + 1;

                if ( !base ) {
                    base = BASE;
                    e = bitFloor( x.e / LOG_BASE ) - bitFloor( y.e / LOG_BASE );
                    s = s / LOG_BASE | 0;
                }

                // Result exponent may be one less then the current value of e.
                // The coefficients of the BigNumbers from convertBase may have trailing zeros.
                for ( i = 0; yc[i] == ( xc[i] || 0 ); i++ );
                if ( yc[i] > ( xc[i] || 0 ) ) e--;

                if ( s < 0 ) {
                    qc.push(1);
                    more = true;
                } else {
                    xL = xc.length;
                    yL = yc.length;
                    i = 0;
                    s += 2;

                    // Normalise xc and yc so highest order digit of yc is >= base / 2.

                    n = mathfloor( base / ( yc[0] + 1 ) );

                    // Not necessary, but to handle odd bases where yc[0] == ( base / 2 ) - 1.
                    // if ( n > 1 || n++ == 1 && yc[0] < base / 2 ) {
                    if ( n > 1 ) {
                        yc = multiply( yc, n, base );
                        xc = multiply( xc, n, base );
                        yL = yc.length;
                        xL = xc.length;
                    }

                    xi = yL;
                    rem = xc.slice( 0, yL );
                    remL = rem.length;

                    // Add zeros to make remainder as long as divisor.
                    for ( ; remL < yL; rem[remL++] = 0 );
                    yz = yc.slice();
                    yz.unshift(0);
                    yc0 = yc[0];
                    if ( yc[1] >= base / 2 ) yc0++;
                    // Not necessary, but to prevent trial digit n > base, when using base 3.
                    // else if ( base == 3 && yc0 == 1 ) yc0 = 1 + 1e-15;

                    do {
                        n = 0;

                        // Compare divisor and remainder.
                        cmp = compare( yc, rem, yL, remL );

                        // If divisor < remainder.
                        if ( cmp < 0 ) {

                            // Calculate trial digit, n.

                            rem0 = rem[0];
                            if ( yL != remL ) rem0 = rem0 * base + ( rem[1] || 0 );

                            // n is how many times the divisor goes into the current remainder.
                            n = mathfloor( rem0 / yc0 );

                            //  Algorithm:
                            //  1. product = divisor * trial digit (n)
                            //  2. if product > remainder: product -= divisor, n--
                            //  3. remainder -= product
                            //  4. if product was < remainder at 2:
                            //    5. compare new remainder and divisor
                            //    6. If remainder > divisor: remainder -= divisor, n++

                            if ( n > 1 ) {

                                // n may be > base only when base is 3.
                                if (n >= base) n = base - 1;

                                // product = divisor * trial digit.
                                prod = multiply( yc, n, base );
                                prodL = prod.length;
                                remL = rem.length;

                                // Compare product and remainder.
                                // If product > remainder.
                                // Trial digit n too high.
                                // n is 1 too high about 5% of the time, and is not known to have
                                // ever been more than 1 too high.
                                while ( compare( prod, rem, prodL, remL ) == 1 ) {
                                    n--;

                                    // Subtract divisor from product.
                                    subtract( prod, yL < prodL ? yz : yc, prodL, base );
                                    prodL = prod.length;
                                    cmp = 1;
                                }
                            } else {

                                // n is 0 or 1, cmp is -1.
                                // If n is 0, there is no need to compare yc and rem again below,
                                // so change cmp to 1 to avoid it.
                                // If n is 1, leave cmp as -1, so yc and rem are compared again.
                                if ( n == 0 ) {

                                    // divisor < remainder, so n must be at least 1.
                                    cmp = n = 1;
                                }

                                // product = divisor
                                prod = yc.slice();
                                prodL = prod.length;
                            }

                            if ( prodL < remL ) prod.unshift(0);

                            // Subtract product from remainder.
                            subtract( rem, prod, remL, base );
                            remL = rem.length;

                             // If product was < remainder.
                            if ( cmp == -1 ) {

                                // Compare divisor and new remainder.
                                // If divisor < new remainder, subtract divisor from remainder.
                                // Trial digit n too low.
                                // n is 1 too low about 5% of the time, and very rarely 2 too low.
                                while ( compare( yc, rem, yL, remL ) < 1 ) {
                                    n++;

                                    // Subtract divisor from remainder.
                                    subtract( rem, yL < remL ? yz : yc, remL, base );
                                    remL = rem.length;
                                }
                            }
                        } else if ( cmp === 0 ) {
                            n++;
                            rem = [0];
                        } // else cmp === 1 and n will be 0

                        // Add the next digit, n, to the result array.
                        qc[i++] = n;

                        // Update the remainder.
                        if ( rem[0] ) {
                            rem[remL++] = xc[xi] || 0;
                        } else {
                            rem = [ xc[xi] ];
                            remL = 1;
                        }
                    } while ( ( xi++ < xL || rem[0] != null ) && s-- );

                    more = rem[0] != null;

                    // Leading zero?
                    if ( !qc[0] ) qc.shift();
                }

                if ( base == BASE ) {

                    // To calculate q.e, first get the number of digits of qc[0].
                    for ( i = 1, s = qc[0]; s >= 10; s /= 10, i++ );
                    round( q, dp + ( q.e = i + e * LOG_BASE - 1 ) + 1, rm, more );

                // Caller is convertBase.
                } else {
                    q.e = e;
                    q.r = +more;
                }

                return q;
            };
        })();


        /*
         * Return a string representing the value of BigNumber n in fixed-point or exponential
         * notation rounded to the specified decimal places or significant digits.
         *
         * n is a BigNumber.
         * i is the index of the last digit required (i.e. the digit that may be rounded up).
         * rm is the rounding mode.
         * caller is caller id: toExponential 19, toFixed 20, toFormat 21, toPrecision 24.
         */
        function format( n, i, rm, caller ) {
            var c0, e, ne, len, str;

            rm = rm != null && isValidInt( rm, 0, 8, caller, roundingMode )
              ? rm | 0 : ROUNDING_MODE;

            if ( !n.c ) return n.toString();
            c0 = n.c[0];
            ne = n.e;

            if ( i == null ) {
                str = coeffToString( n.c );
                str = caller == 19 || caller == 24 && ne <= TO_EXP_NEG
                  ? toExponential( str, ne )
                  : toFixedPoint( str, ne );
            } else {
                n = round( new BigNumber(n), i, rm );

                // n.e may have changed if the value was rounded up.
                e = n.e;

                str = coeffToString( n.c );
                len = str.length;

                // toPrecision returns exponential notation if the number of significant digits
                // specified is less than the number of digits necessary to represent the integer
                // part of the value in fixed-point notation.

                // Exponential notation.
                if ( caller == 19 || caller == 24 && ( i <= e || e <= TO_EXP_NEG ) ) {

                    // Append zeros?
                    for ( ; len < i; str += '0', len++ );
                    str = toExponential( str, e );

                // Fixed-point notation.
                } else {
                    i -= ne;
                    str = toFixedPoint( str, e );

                    // Append zeros?
                    if ( e + 1 > len ) {
                        if ( --i > 0 ) for ( str += '.'; i--; str += '0' );
                    } else {
                        i += e - len;
                        if ( i > 0 ) {
                            if ( e + 1 == len ) str += '.';
                            for ( ; i--; str += '0' );
                        }
                    }
                }
            }

            return n.s < 0 && c0 ? '-' + str : str;
        }


        // Handle BigNumber.max and BigNumber.min.
        function maxOrMin( args, method ) {
            var m, n,
                i = 0;

            if ( isArray( args[0] ) ) args = args[0];
            m = new BigNumber( args[0] );

            for ( ; ++i < args.length; ) {
                n = new BigNumber( args[i] );

                // If any number is NaN, return NaN.
                if ( !n.s ) {
                    m = n;
                    break;
                } else if ( method.call( m, n ) ) {
                    m = n;
                }
            }

            return m;
        }


        /*
         * Return true if n is an integer in range, otherwise throw.
         * Use for argument validation when ERRORS is true.
         */
        function intValidatorWithErrors( n, min, max, caller, name ) {
            if ( n < min || n > max || n != truncate(n) ) {
                raise( caller, ( name || 'decimal places' ) +
                  ( n < min || n > max ? ' out of range' : ' not an integer' ), n );
            }

            return true;
        }


        /*
         * Strip trailing zeros, calculate base 10 exponent and check against MIN_EXP and MAX_EXP.
         * Called by minus, plus and times.
         */
        function normalise( n, c, e ) {
            var i = 1,
                j = c.length;

             // Remove trailing zeros.
            for ( ; !c[--j]; c.pop() );

            // Calculate the base 10 exponent. First get the number of digits of c[0].
            for ( j = c[0]; j >= 10; j /= 10, i++ );

            // Overflow?
            if ( ( e = i + e * LOG_BASE - 1 ) > MAX_EXP ) {

                // Infinity.
                n.c = n.e = null;

            // Underflow?
            } else if ( e < MIN_EXP ) {

                // Zero.
                n.c = [ n.e = 0 ];
            } else {
                n.e = e;
                n.c = c;
            }

            return n;
        }


        // Handle values that fail the validity test in BigNumber.
        parseNumeric = (function () {
            var basePrefix = /^(-?)0([xbo])/i,
                dotAfter = /^([^.]+)\.$/,
                dotBefore = /^\.([^.]+)$/,
                isInfinityOrNaN = /^-?(Infinity|NaN)$/,
                whitespaceOrPlus = /^\s*\+|^\s+|\s+$/g;

            return function ( x, str, num, b ) {
                var base,
                    s = num ? str : str.replace( whitespaceOrPlus, '' );

                // No exception on ±Infinity or NaN.
                if ( isInfinityOrNaN.test(s) ) {
                    x.s = isNaN(s) ? null : s < 0 ? -1 : 1;
                } else {
                    if ( !num ) {

                        // basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i
                        s = s.replace( basePrefix, function ( m, p1, p2 ) {
                            base = ( p2 = p2.toLowerCase() ) == 'x' ? 16 : p2 == 'b' ? 2 : 8;
                            return !b || b == base ? p1 : m;
                        });

                        if (b) {
                            base = b;

                            // E.g. '1.' to '1', '.1' to '0.1'
                            s = s.replace( dotAfter, '$1' ).replace( dotBefore, '0.$1' );
                        }

                        if ( str != s ) return new BigNumber( s, base );
                    }

                    // 'new BigNumber() not a number: {n}'
                    // 'new BigNumber() not a base {b} number: {n}'
                    if (ERRORS) raise( id, 'not a' + ( b ? ' base ' + b : '' ) + ' number', str );
                    x.s = null;
                }

                x.c = x.e = null;
                id = 0;
            }
        })();


        // Throw a BigNumber Error.
        function raise( caller, msg, val ) {
            var error = new Error( [
                'new BigNumber',     // 0
                'cmp',               // 1
                'config',            // 2
                'div',               // 3
                'divToInt',          // 4
                'eq',                // 5
                'gt',                // 6
                'gte',               // 7
                'lt',                // 8
                'lte',               // 9
                'minus',             // 10
                'mod',               // 11
                'plus',              // 12
                'precision',         // 13
                'random',            // 14
                'round',             // 15
                'shift',             // 16
                'times',             // 17
                'toDigits',          // 18
                'toExponential',     // 19
                'toFixed',           // 20
                'toFormat',          // 21
                'toFraction',        // 22
                'pow',               // 23
                'toPrecision',       // 24
                'toString',          // 25
                'BigNumber'          // 26
            ][caller] + '() ' + msg + ': ' + val );

            error.name = 'BigNumber Error';
            id = 0;
            throw error;
        }


        /*
         * Round x to sd significant digits using rounding mode rm. Check for over/under-flow.
         * If r is truthy, it is known that there are more digits after the rounding digit.
         */
        function round( x, sd, rm, r ) {
            var d, i, j, k, n, ni, rd,
                xc = x.c,
                pows10 = POWS_TEN;

            // if x is not Infinity or NaN...
            if (xc) {

                // rd is the rounding digit, i.e. the digit after the digit that may be rounded up.
                // n is a base 1e14 number, the value of the element of array x.c containing rd.
                // ni is the index of n within x.c.
                // d is the number of digits of n.
                // i is the index of rd within n including leading zeros.
                // j is the actual index of rd within n (if < 0, rd is a leading zero).
                out: {

                    // Get the number of digits of the first element of xc.
                    for ( d = 1, k = xc[0]; k >= 10; k /= 10, d++ );
                    i = sd - d;

                    // If the rounding digit is in the first element of xc...
                    if ( i < 0 ) {
                        i += LOG_BASE;
                        j = sd;
                        n = xc[ ni = 0 ];

                        // Get the rounding digit at index j of n.
                        rd = n / pows10[ d - j - 1 ] % 10 | 0;
                    } else {
                        ni = mathceil( ( i + 1 ) / LOG_BASE );

                        if ( ni >= xc.length ) {

                            if (r) {

                                // Needed by sqrt.
                                for ( ; xc.length <= ni; xc.push(0) );
                                n = rd = 0;
                                d = 1;
                                i %= LOG_BASE;
                                j = i - LOG_BASE + 1;
                            } else {
                                break out;
                            }
                        } else {
                            n = k = xc[ni];

                            // Get the number of digits of n.
                            for ( d = 1; k >= 10; k /= 10, d++ );

                            // Get the index of rd within n.
                            i %= LOG_BASE;

                            // Get the index of rd within n, adjusted for leading zeros.
                            // The number of leading zeros of n is given by LOG_BASE - d.
                            j = i - LOG_BASE + d;

                            // Get the rounding digit at index j of n.
                            rd = j < 0 ? 0 : n / pows10[ d - j - 1 ] % 10 | 0;
                        }
                    }

                    r = r || sd < 0 ||

                    // Are there any non-zero digits after the rounding digit?
                    // The expression  n % pows10[ d - j - 1 ]  returns all digits of n to the right
                    // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
                      xc[ni + 1] != null || ( j < 0 ? n : n % pows10[ d - j - 1 ] );

                    r = rm < 4
                      ? ( rd || r ) && ( rm == 0 || rm == ( x.s < 0 ? 3 : 2 ) )
                      : rd > 5 || rd == 5 && ( rm == 4 || r || rm == 6 &&

                        // Check whether the digit to the left of the rounding digit is odd.
                        ( ( i > 0 ? j > 0 ? n / pows10[ d - j ] : 0 : xc[ni - 1] ) % 10 ) & 1 ||
                          rm == ( x.s < 0 ? 8 : 7 ) );

                    if ( sd < 1 || !xc[0] ) {
                        xc.length = 0;

                        if (r) {

                            // Convert sd to decimal places.
                            sd -= x.e + 1;

                            // 1, 0.1, 0.01, 0.001, 0.0001 etc.
                            xc[0] = pows10[ sd % LOG_BASE ];
                            x.e = -sd || 0;
                        } else {

                            // Zero.
                            xc[0] = x.e = 0;
                        }

                        return x;
                    }

                    // Remove excess digits.
                    if ( i == 0 ) {
                        xc.length = ni;
                        k = 1;
                        ni--;
                    } else {
                        xc.length = ni + 1;
                        k = pows10[ LOG_BASE - i ];

                        // E.g. 56700 becomes 56000 if 7 is the rounding digit.
                        // j > 0 means i > number of leading zeros of n.
                        xc[ni] = j > 0 ? mathfloor( n / pows10[ d - j ] % pows10[j] ) * k : 0;
                    }

                    // Round up?
                    if (r) {

                        for ( ; ; ) {

                            // If the digit to be rounded up is in the first element of xc...
                            if ( ni == 0 ) {

                                // i will be the length of xc[0] before k is added.
                                for ( i = 1, j = xc[0]; j >= 10; j /= 10, i++ );
                                j = xc[0] += k;
                                for ( k = 1; j >= 10; j /= 10, k++ );

                                // if i != k the length has increased.
                                if ( i != k ) {
                                    x.e++;
                                    if ( xc[0] == BASE ) xc[0] = 1;
                                }

                                break;
                            } else {
                                xc[ni] += k;
                                if ( xc[ni] != BASE ) break;
                                xc[ni--] = 0;
                                k = 1;
                            }
                        }
                    }

                    // Remove trailing zeros.
                    for ( i = xc.length; xc[--i] === 0; xc.pop() );
                }

                // Overflow? Infinity.
                if ( x.e > MAX_EXP ) {
                    x.c = x.e = null;

                // Underflow? Zero.
                } else if ( x.e < MIN_EXP ) {
                    x.c = [ x.e = 0 ];
                }
            }

            return x;
        }


        // PROTOTYPE/INSTANCE METHODS


        /*
         * Return a new BigNumber whose value is the absolute value of this BigNumber.
         */
        P.absoluteValue = P.abs = function () {
            var x = new BigNumber(this);
            if ( x.s < 0 ) x.s = 1;
            return x;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a whole
         * number in the direction of Infinity.
         */
        P.ceil = function () {
            return round( new BigNumber(this), this.e + 1, 2 );
        };


        /*
         * Return
         * 1 if the value of this BigNumber is greater than the value of BigNumber(y, b),
         * -1 if the value of this BigNumber is less than the value of BigNumber(y, b),
         * 0 if they have the same value,
         * or null if the value of either is NaN.
         */
        P.comparedTo = P.cmp = function ( y, b ) {
            id = 1;
            return compare( this, new BigNumber( y, b ) );
        };


        /*
         * Return the number of decimal places of the value of this BigNumber, or null if the value
         * of this BigNumber is ±Infinity or NaN.
         */
        P.decimalPlaces = P.dp = function () {
            var n, v,
                c = this.c;

            if ( !c ) return null;
            n = ( ( v = c.length - 1 ) - bitFloor( this.e / LOG_BASE ) ) * LOG_BASE;

            // Subtract the number of trailing zeros of the last number.
            if ( v = c[v] ) for ( ; v % 10 == 0; v /= 10, n-- );
            if ( n < 0 ) n = 0;

            return n;
        };


        /*
         *  n / 0 = I
         *  n / N = N
         *  n / I = 0
         *  0 / n = 0
         *  0 / 0 = N
         *  0 / N = N
         *  0 / I = 0
         *  N / n = N
         *  N / 0 = N
         *  N / N = N
         *  N / I = N
         *  I / n = I
         *  I / 0 = I
         *  I / N = N
         *  I / I = N
         *
         * Return a new BigNumber whose value is the value of this BigNumber divided by the value of
         * BigNumber(y, b), rounded according to DECIMAL_PLACES and ROUNDING_MODE.
         */
        P.dividedBy = P.div = function ( y, b ) {
            id = 3;
            return div( this, new BigNumber( y, b ), DECIMAL_PLACES, ROUNDING_MODE );
        };


        /*
         * Return a new BigNumber whose value is the integer part of dividing the value of this
         * BigNumber by the value of BigNumber(y, b).
         */
        P.dividedToIntegerBy = P.divToInt = function ( y, b ) {
            id = 4;
            return div( this, new BigNumber( y, b ), 0, 1 );
        };


        /*
         * Return true if the value of this BigNumber is equal to the value of BigNumber(y, b),
         * otherwise returns false.
         */
        P.equals = P.eq = function ( y, b ) {
            id = 5;
            return compare( this, new BigNumber( y, b ) ) === 0;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a whole
         * number in the direction of -Infinity.
         */
        P.floor = function () {
            return round( new BigNumber(this), this.e + 1, 3 );
        };


        /*
         * Return true if the value of this BigNumber is greater than the value of BigNumber(y, b),
         * otherwise returns false.
         */
        P.greaterThan = P.gt = function ( y, b ) {
            id = 6;
            return compare( this, new BigNumber( y, b ) ) > 0;
        };


        /*
         * Return true if the value of this BigNumber is greater than or equal to the value of
         * BigNumber(y, b), otherwise returns false.
         */
        P.greaterThanOrEqualTo = P.gte = function ( y, b ) {
            id = 7;
            return ( b = compare( this, new BigNumber( y, b ) ) ) === 1 || b === 0;

        };


        /*
         * Return true if the value of this BigNumber is a finite number, otherwise returns false.
         */
        P.isFinite = function () {
            return !!this.c;
        };


        /*
         * Return true if the value of this BigNumber is an integer, otherwise return false.
         */
        P.isInteger = P.isInt = function () {
            return !!this.c && bitFloor( this.e / LOG_BASE ) > this.c.length - 2;
        };


        /*
         * Return true if the value of this BigNumber is NaN, otherwise returns false.
         */
        P.isNaN = function () {
            return !this.s;
        };


        /*
         * Return true if the value of this BigNumber is negative, otherwise returns false.
         */
        P.isNegative = P.isNeg = function () {
            return this.s < 0;
        };


        /*
         * Return true if the value of this BigNumber is 0 or -0, otherwise returns false.
         */
        P.isZero = function () {
            return !!this.c && this.c[0] == 0;
        };


        /*
         * Return true if the value of this BigNumber is less than the value of BigNumber(y, b),
         * otherwise returns false.
         */
        P.lessThan = P.lt = function ( y, b ) {
            id = 8;
            return compare( this, new BigNumber( y, b ) ) < 0;
        };


        /*
         * Return true if the value of this BigNumber is less than or equal to the value of
         * BigNumber(y, b), otherwise returns false.
         */
        P.lessThanOrEqualTo = P.lte = function ( y, b ) {
            id = 9;
            return ( b = compare( this, new BigNumber( y, b ) ) ) === -1 || b === 0;
        };


        /*
         *  n - 0 = n
         *  n - N = N
         *  n - I = -I
         *  0 - n = -n
         *  0 - 0 = 0
         *  0 - N = N
         *  0 - I = -I
         *  N - n = N
         *  N - 0 = N
         *  N - N = N
         *  N - I = N
         *  I - n = I
         *  I - 0 = I
         *  I - N = N
         *  I - I = N
         *
         * Return a new BigNumber whose value is the value of this BigNumber minus the value of
         * BigNumber(y, b).
         */
        P.minus = P.sub = function ( y, b ) {
            var i, j, t, xLTy,
                x = this,
                a = x.s;

            id = 10;
            y = new BigNumber( y, b );
            b = y.s;

            // Either NaN?
            if ( !a || !b ) return new BigNumber(NaN);

            // Signs differ?
            if ( a != b ) {
                y.s = -b;
                return x.plus(y);
            }

            var xe = x.e / LOG_BASE,
                ye = y.e / LOG_BASE,
                xc = x.c,
                yc = y.c;

            if ( !xe || !ye ) {

                // Either Infinity?
                if ( !xc || !yc ) return xc ? ( y.s = -b, y ) : new BigNumber( yc ? x : NaN );

                // Either zero?
                if ( !xc[0] || !yc[0] ) {

                    // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
                    return yc[0] ? ( y.s = -b, y ) : new BigNumber( xc[0] ? x :

                      // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
                      ROUNDING_MODE == 3 ? -0 : 0 );
                }
            }

            xe = bitFloor(xe);
            ye = bitFloor(ye);
            xc = xc.slice();

            // Determine which is the bigger number.
            if ( a = xe - ye ) {

                if ( xLTy = a < 0 ) {
                    a = -a;
                    t = xc;
                } else {
                    ye = xe;
                    t = yc;
                }

                t.reverse();

                // Prepend zeros to equalise exponents.
                for ( b = a; b--; t.push(0) );
                t.reverse();
            } else {

                // Exponents equal. Check digit by digit.
                j = ( xLTy = ( a = xc.length ) < ( b = yc.length ) ) ? a : b;

                for ( a = b = 0; b < j; b++ ) {

                    if ( xc[b] != yc[b] ) {
                        xLTy = xc[b] < yc[b];
                        break;
                    }
                }
            }

            // x < y? Point xc to the array of the bigger number.
            if (xLTy) t = xc, xc = yc, yc = t, y.s = -y.s;

            b = ( j = yc.length ) - ( i = xc.length );

            // Append zeros to xc if shorter.
            // No need to add zeros to yc if shorter as subtract only needs to start at yc.length.
            if ( b > 0 ) for ( ; b--; xc[i++] = 0 );
            b = BASE - 1;

            // Subtract yc from xc.
            for ( ; j > a; ) {

                if ( xc[--j] < yc[j] ) {
                    for ( i = j; i && !xc[--i]; xc[i] = b );
                    --xc[i];
                    xc[j] += BASE;
                }

                xc[j] -= yc[j];
            }

            // Remove leading zeros and adjust exponent accordingly.
            for ( ; xc[0] == 0; xc.shift(), --ye );

            // Zero?
            if ( !xc[0] ) {

                // Following IEEE 754 (2008) 6.3,
                // n - n = +0  but  n - n = -0  when rounding towards -Infinity.
                y.s = ROUNDING_MODE == 3 ? -1 : 1;
                y.c = [ y.e = 0 ];
                return y;
            }

            // No need to check for Infinity as +x - +y != Infinity && -x - -y != Infinity
            // for finite x and y.
            return normalise( y, xc, ye );
        };


        /*
         *   n % 0 =  N
         *   n % N =  N
         *   n % I =  n
         *   0 % n =  0
         *  -0 % n = -0
         *   0 % 0 =  N
         *   0 % N =  N
         *   0 % I =  0
         *   N % n =  N
         *   N % 0 =  N
         *   N % N =  N
         *   N % I =  N
         *   I % n =  N
         *   I % 0 =  N
         *   I % N =  N
         *   I % I =  N
         *
         * Return a new BigNumber whose value is the value of this BigNumber modulo the value of
         * BigNumber(y, b). The result depends on the value of MODULO_MODE.
         */
        P.modulo = P.mod = function ( y, b ) {
            var q, s,
                x = this;

            id = 11;
            y = new BigNumber( y, b );

            // Return NaN if x is Infinity or NaN, or y is NaN or zero.
            if ( !x.c || !y.s || y.c && !y.c[0] ) {
                return new BigNumber(NaN);

            // Return x if y is Infinity or x is zero.
            } else if ( !y.c || x.c && !x.c[0] ) {
                return new BigNumber(x);
            }

            if ( MODULO_MODE == 9 ) {

                // Euclidian division: q = sign(y) * floor(x / abs(y))
                // r = x - qy    where  0 <= r < abs(y)
                s = y.s;
                y.s = 1;
                q = div( x, y, 0, 3 );
                y.s = s;
                q.s *= s;
            } else {
                q = div( x, y, 0, MODULO_MODE );
            }

            return x.minus( q.times(y) );
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber negated,
         * i.e. multiplied by -1.
         */
        P.negated = P.neg = function () {
            var x = new BigNumber(this);
            x.s = -x.s || null;
            return x;
        };


        /*
         *  n + 0 = n
         *  n + N = N
         *  n + I = I
         *  0 + n = n
         *  0 + 0 = 0
         *  0 + N = N
         *  0 + I = I
         *  N + n = N
         *  N + 0 = N
         *  N + N = N
         *  N + I = N
         *  I + n = I
         *  I + 0 = I
         *  I + N = N
         *  I + I = I
         *
         * Return a new BigNumber whose value is the value of this BigNumber plus the value of
         * BigNumber(y, b).
         */
        P.plus = P.add = function ( y, b ) {
            var t,
                x = this,
                a = x.s;

            id = 12;
            y = new BigNumber( y, b );
            b = y.s;

            // Either NaN?
            if ( !a || !b ) return new BigNumber(NaN);

            // Signs differ?
             if ( a != b ) {
                y.s = -b;
                return x.minus(y);
            }

            var xe = x.e / LOG_BASE,
                ye = y.e / LOG_BASE,
                xc = x.c,
                yc = y.c;

            if ( !xe || !ye ) {

                // Return ±Infinity if either ±Infinity.
                if ( !xc || !yc ) return new BigNumber( a / 0 );

                // Either zero?
                // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
                if ( !xc[0] || !yc[0] ) return yc[0] ? y : new BigNumber( xc[0] ? x : a * 0 );
            }

            xe = bitFloor(xe);
            ye = bitFloor(ye);
            xc = xc.slice();

            // Prepend zeros to equalise exponents. Faster to use reverse then do unshifts.
            if ( a = xe - ye ) {
                if ( a > 0 ) {
                    ye = xe;
                    t = yc;
                } else {
                    a = -a;
                    t = xc;
                }

                t.reverse();
                for ( ; a--; t.push(0) );
                t.reverse();
            }

            a = xc.length;
            b = yc.length;

            // Point xc to the longer array, and b to the shorter length.
            if ( a - b < 0 ) t = yc, yc = xc, xc = t, b = a;

            // Only start adding at yc.length - 1 as the further digits of xc can be ignored.
            for ( a = 0; b; ) {
                a = ( xc[--b] = xc[b] + yc[b] + a ) / BASE | 0;
                xc[b] %= BASE;
            }

            if (a) {
                xc.unshift(a);
                ++ye;
            }

            // No need to check for zero, as +x + +y != 0 && -x + -y != 0
            // ye = MAX_EXP + 1 possible
            return normalise( y, xc, ye );
        };


        /*
         * Return the number of significant digits of the value of this BigNumber.
         *
         * [z] {boolean|number} Whether to count integer-part trailing zeros: true, false, 1 or 0.
         */
        P.precision = P.sd = function (z) {
            var n, v,
                x = this,
                c = x.c;

            // 'precision() argument not a boolean or binary digit: {z}'
            if ( z != null && z !== !!z && z !== 1 && z !== 0 ) {
                if (ERRORS) raise( 13, 'argument' + notBool, z );
                if ( z != !!z ) z = null;
            }

            if ( !c ) return null;
            v = c.length - 1;
            n = v * LOG_BASE + 1;

            if ( v = c[v] ) {

                // Subtract the number of trailing zeros of the last element.
                for ( ; v % 10 == 0; v /= 10, n-- );

                // Add the number of digits of the first element.
                for ( v = c[0]; v >= 10; v /= 10, n++ );
            }

            if ( z && x.e + 1 > n ) n = x.e + 1;

            return n;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a maximum of
         * dp decimal places using rounding mode rm, or to 0 and ROUNDING_MODE respectively if
         * omitted.
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'round() decimal places out of range: {dp}'
         * 'round() decimal places not an integer: {dp}'
         * 'round() rounding mode not an integer: {rm}'
         * 'round() rounding mode out of range: {rm}'
         */
        P.round = function ( dp, rm ) {
            var n = new BigNumber(this);

            if ( dp == null || isValidInt( dp, 0, MAX, 15 ) ) {
                round( n, ~~dp + this.e + 1, rm == null ||
                  !isValidInt( rm, 0, 8, 15, roundingMode ) ? ROUNDING_MODE : rm | 0 );
            }

            return n;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber shifted by k places
         * (powers of 10). Shift to the right if n > 0, and to the left if n < 0.
         *
         * k {number} Integer, -MAX_SAFE_INTEGER to MAX_SAFE_INTEGER inclusive.
         *
         * If k is out of range and ERRORS is false, the result will be ±0 if k < 0, or ±Infinity
         * otherwise.
         *
         * 'shift() argument not an integer: {k}'
         * 'shift() argument out of range: {k}'
         */
        P.shift = function (k) {
            var n = this;
            return isValidInt( k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER, 16, 'argument' )

              // k < 1e+21, or truncate(k) will produce exponential notation.
              ? n.times( '1e' + truncate(k) )
              : new BigNumber( n.c && n.c[0] && ( k < -MAX_SAFE_INTEGER || k > MAX_SAFE_INTEGER )
                ? n.s * ( k < 0 ? 0 : 1 / 0 )
                : n );
        };


        /*
         *  sqrt(-n) =  N
         *  sqrt( N) =  N
         *  sqrt(-I) =  N
         *  sqrt( I) =  I
         *  sqrt( 0) =  0
         *  sqrt(-0) = -0
         *
         * Return a new BigNumber whose value is the square root of the value of this BigNumber,
         * rounded according to DECIMAL_PLACES and ROUNDING_MODE.
         */
        P.squareRoot = P.sqrt = function () {
            var m, n, r, rep, t,
                x = this,
                c = x.c,
                s = x.s,
                e = x.e,
                dp = DECIMAL_PLACES + 4,
                half = new BigNumber('0.5');

            // Negative/NaN/Infinity/zero?
            if ( s !== 1 || !c || !c[0] ) {
                return new BigNumber( !s || s < 0 && ( !c || c[0] ) ? NaN : c ? x : 1 / 0 );
            }

            // Initial estimate.
            s = Math.sqrt( +x );

            // Math.sqrt underflow/overflow?
            // Pass x to Math.sqrt as integer, then adjust the exponent of the result.
            if ( s == 0 || s == 1 / 0 ) {
                n = coeffToString(c);
                if ( ( n.length + e ) % 2 == 0 ) n += '0';
                s = Math.sqrt(n);
                e = bitFloor( ( e + 1 ) / 2 ) - ( e < 0 || e % 2 );

                if ( s == 1 / 0 ) {
                    n = '1e' + e;
                } else {
                    n = s.toExponential();
                    n = n.slice( 0, n.indexOf('e') + 1 ) + e;
                }

                r = new BigNumber(n);
            } else {
                r = new BigNumber( s + '' );
            }

            // Check for zero.
            // r could be zero if MIN_EXP is changed after the this value was created.
            // This would cause a division by zero (x/t) and hence Infinity below, which would cause
            // coeffToString to throw.
            if ( r.c[0] ) {
                e = r.e;
                s = e + dp;
                if ( s < 3 ) s = 0;

                // Newton-Raphson iteration.
                for ( ; ; ) {
                    t = r;
                    r = half.times( t.plus( div( x, t, dp, 1 ) ) );

                    if ( coeffToString( t.c   ).slice( 0, s ) === ( n =
                         coeffToString( r.c ) ).slice( 0, s ) ) {

                        // The exponent of r may here be one less than the final result exponent,
                        // e.g 0.0009999 (e-4) --> 0.001 (e-3), so adjust s so the rounding digits
                        // are indexed correctly.
                        if ( r.e < e ) --s;
                        n = n.slice( s - 3, s + 1 );

                        // The 4th rounding digit may be in error by -1 so if the 4 rounding digits
                        // are 9999 or 4999 (i.e. approaching a rounding boundary) continue the
                        // iteration.
                        if ( n == '9999' || !rep && n == '4999' ) {

                            // On the first iteration only, check to see if rounding up gives the
                            // exact result as the nines may infinitely repeat.
                            if ( !rep ) {
                                round( t, t.e + DECIMAL_PLACES + 2, 0 );

                                if ( t.times(t).eq(x) ) {
                                    r = t;
                                    break;
                                }
                            }

                            dp += 4;
                            s += 4;
                            rep = 1;
                        } else {

                            // If rounding digits are null, 0{0,4} or 50{0,3}, check for exact
                            // result. If not, then there are further digits and m will be truthy.
                            if ( !+n || !+n.slice(1) && n.charAt(0) == '5' ) {

                                // Truncate to the first rounding digit.
                                round( r, r.e + DECIMAL_PLACES + 2, 1 );
                                m = !r.times(r).eq(x);
                            }

                            break;
                        }
                    }
                }
            }

            return round( r, r.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m );
        };


        /*
         *  n * 0 = 0
         *  n * N = N
         *  n * I = I
         *  0 * n = 0
         *  0 * 0 = 0
         *  0 * N = N
         *  0 * I = N
         *  N * n = N
         *  N * 0 = N
         *  N * N = N
         *  N * I = N
         *  I * n = I
         *  I * 0 = N
         *  I * N = N
         *  I * I = I
         *
         * Return a new BigNumber whose value is the value of this BigNumber times the value of
         * BigNumber(y, b).
         */
        P.times = P.mul = function ( y, b ) {
            var c, e, i, j, k, m, xcL, xlo, xhi, ycL, ylo, yhi, zc,
                base, sqrtBase,
                x = this,
                xc = x.c,
                yc = ( id = 17, y = new BigNumber( y, b ) ).c;

            // Either NaN, ±Infinity or ±0?
            if ( !xc || !yc || !xc[0] || !yc[0] ) {

                // Return NaN if either is NaN, or one is 0 and the other is Infinity.
                if ( !x.s || !y.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc ) {
                    y.c = y.e = y.s = null;
                } else {
                    y.s *= x.s;

                    // Return ±Infinity if either is ±Infinity.
                    if ( !xc || !yc ) {
                        y.c = y.e = null;

                    // Return ±0 if either is ±0.
                    } else {
                        y.c = [0];
                        y.e = 0;
                    }
                }

                return y;
            }

            e = bitFloor( x.e / LOG_BASE ) + bitFloor( y.e / LOG_BASE );
            y.s *= x.s;
            xcL = xc.length;
            ycL = yc.length;

            // Ensure xc points to longer array and xcL to its length.
            if ( xcL < ycL ) zc = xc, xc = yc, yc = zc, i = xcL, xcL = ycL, ycL = i;

            // Initialise the result array with zeros.
            for ( i = xcL + ycL, zc = []; i--; zc.push(0) );

            base = BASE;
            sqrtBase = SQRT_BASE;

            for ( i = ycL; --i >= 0; ) {
                c = 0;
                ylo = yc[i] % sqrtBase;
                yhi = yc[i] / sqrtBase | 0;

                for ( k = xcL, j = i + k; j > i; ) {
                    xlo = xc[--k] % sqrtBase;
                    xhi = xc[k] / sqrtBase | 0;
                    m = yhi * xlo + xhi * ylo;
                    xlo = ylo * xlo + ( ( m % sqrtBase ) * sqrtBase ) + zc[j] + c;
                    c = ( xlo / base | 0 ) + ( m / sqrtBase | 0 ) + yhi * xhi;
                    zc[j--] = xlo % base;
                }

                zc[j] = c;
            }

            if (c) {
                ++e;
            } else {
                zc.shift();
            }

            return normalise( y, zc, e );
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a maximum of
         * sd significant digits using rounding mode rm, or ROUNDING_MODE if rm is omitted.
         *
         * [sd] {number} Significant digits. Integer, 1 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toDigits() precision out of range: {sd}'
         * 'toDigits() precision not an integer: {sd}'
         * 'toDigits() rounding mode not an integer: {rm}'
         * 'toDigits() rounding mode out of range: {rm}'
         */
        P.toDigits = function ( sd, rm ) {
            var n = new BigNumber(this);
            sd = sd == null || !isValidInt( sd, 1, MAX, 18, 'precision' ) ? null : sd | 0;
            rm = rm == null || !isValidInt( rm, 0, 8, 18, roundingMode ) ? ROUNDING_MODE : rm | 0;
            return sd ? round( n, sd, rm ) : n;
        };


        /*
         * Return a string representing the value of this BigNumber in exponential notation and
         * rounded using ROUNDING_MODE to dp fixed decimal places.
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toExponential() decimal places not an integer: {dp}'
         * 'toExponential() decimal places out of range: {dp}'
         * 'toExponential() rounding mode not an integer: {rm}'
         * 'toExponential() rounding mode out of range: {rm}'
         */
        P.toExponential = function ( dp, rm ) {
            return format( this,
              dp != null && isValidInt( dp, 0, MAX, 19 ) ? ~~dp + 1 : null, rm, 19 );
        };


        /*
         * Return a string representing the value of this BigNumber in fixed-point notation rounding
         * to dp fixed decimal places using rounding mode rm, or ROUNDING_MODE if rm is omitted.
         *
         * Note: as with JavaScript's number type, (-0).toFixed(0) is '0',
         * but e.g. (-0.00001).toFixed(0) is '-0'.
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toFixed() decimal places not an integer: {dp}'
         * 'toFixed() decimal places out of range: {dp}'
         * 'toFixed() rounding mode not an integer: {rm}'
         * 'toFixed() rounding mode out of range: {rm}'
         */
        P.toFixed = function ( dp, rm ) {
            return format( this, dp != null && isValidInt( dp, 0, MAX, 20 )
              ? ~~dp + this.e + 1 : null, rm, 20 );
        };


        /*
         * Return a string representing the value of this BigNumber in fixed-point notation rounded
         * using rm or ROUNDING_MODE to dp decimal places, and formatted according to the properties
         * of the FORMAT object (see BigNumber.config).
         *
         * FORMAT = {
         *      decimalSeparator : '.',
         *      groupSeparator : ',',
         *      groupSize : 3,
         *      secondaryGroupSize : 0,
         *      fractionGroupSeparator : '\xA0',    // non-breaking space
         *      fractionGroupSize : 0
         * };
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toFormat() decimal places not an integer: {dp}'
         * 'toFormat() decimal places out of range: {dp}'
         * 'toFormat() rounding mode not an integer: {rm}'
         * 'toFormat() rounding mode out of range: {rm}'
         */
        P.toFormat = function ( dp, rm ) {
            var str = format( this, dp != null && isValidInt( dp, 0, MAX, 21 )
              ? ~~dp + this.e + 1 : null, rm, 21 );

            if ( this.c ) {
                var i,
                    arr = str.split('.'),
                    g1 = +FORMAT.groupSize,
                    g2 = +FORMAT.secondaryGroupSize,
                    groupSeparator = FORMAT.groupSeparator,
                    intPart = arr[0],
                    fractionPart = arr[1],
                    isNeg = this.s < 0,
                    intDigits = isNeg ? intPart.slice(1) : intPart,
                    len = intDigits.length;

                if (g2) i = g1, g1 = g2, g2 = i, len -= i;

                if ( g1 > 0 && len > 0 ) {
                    i = len % g1 || g1;
                    intPart = intDigits.substr( 0, i );

                    for ( ; i < len; i += g1 ) {
                        intPart += groupSeparator + intDigits.substr( i, g1 );
                    }

                    if ( g2 > 0 ) intPart += groupSeparator + intDigits.slice(i);
                    if (isNeg) intPart = '-' + intPart;
                }

                str = fractionPart
                  ? intPart + FORMAT.decimalSeparator + ( ( g2 = +FORMAT.fractionGroupSize )
                    ? fractionPart.replace( new RegExp( '\\d{' + g2 + '}\\B', 'g' ),
                      '$&' + FORMAT.fractionGroupSeparator )
                    : fractionPart )
                  : intPart;
            }

            return str;
        };


        /*
         * Return a string array representing the value of this BigNumber as a simple fraction with
         * an integer numerator and an integer denominator. The denominator will be a positive
         * non-zero value less than or equal to the specified maximum denominator. If a maximum
         * denominator is not specified, the denominator will be the lowest value necessary to
         * represent the number exactly.
         *
         * [md] {number|string|BigNumber} Integer >= 1 and < Infinity. The maximum denominator.
         *
         * 'toFraction() max denominator not an integer: {md}'
         * 'toFraction() max denominator out of range: {md}'
         */
        P.toFraction = function (md) {
            var arr, d0, d2, e, exp, n, n0, q, s,
                k = ERRORS,
                x = this,
                xc = x.c,
                d = new BigNumber(ONE),
                n1 = d0 = new BigNumber(ONE),
                d1 = n0 = new BigNumber(ONE);

            if ( md != null ) {
                ERRORS = false;
                n = new BigNumber(md);
                ERRORS = k;

                if ( !( k = n.isInt() ) || n.lt(ONE) ) {

                    if (ERRORS) {
                        raise( 22,
                          'max denominator ' + ( k ? 'out of range' : 'not an integer' ), md );
                    }

                    // ERRORS is false:
                    // If md is a finite non-integer >= 1, round it to an integer and use it.
                    md = !k && n.c && round( n, n.e + 1, 1 ).gte(ONE) ? n : null;
                }
            }

            if ( !xc ) return x.toString();
            s = coeffToString(xc);

            // Determine initial denominator.
            // d is a power of 10 and the minimum max denominator that specifies the value exactly.
            e = d.e = s.length - x.e - 1;
            d.c[0] = POWS_TEN[ ( exp = e % LOG_BASE ) < 0 ? LOG_BASE + exp : exp ];
            md = !md || n.cmp(d) > 0 ? ( e > 0 ? d : n1 ) : n;

            exp = MAX_EXP;
            MAX_EXP = 1 / 0;
            n = new BigNumber(s);

            // n0 = d1 = 0
            n0.c[0] = 0;

            for ( ; ; )  {
                q = div( n, d, 0, 1 );
                d2 = d0.plus( q.times(d1) );
                if ( d2.cmp(md) == 1 ) break;
                d0 = d1;
                d1 = d2;
                n1 = n0.plus( q.times( d2 = n1 ) );
                n0 = d2;
                d = n.minus( q.times( d2 = d ) );
                n = d2;
            }

            d2 = div( md.minus(d0), d1, 0, 1 );
            n0 = n0.plus( d2.times(n1) );
            d0 = d0.plus( d2.times(d1) );
            n0.s = n1.s = x.s;
            e *= 2;

            // Determine which fraction is closer to x, n0/d0 or n1/d1
            arr = div( n1, d1, e, ROUNDING_MODE ).minus(x).abs().cmp(
                  div( n0, d0, e, ROUNDING_MODE ).minus(x).abs() ) < 1
                    ? [ n1.toString(), d1.toString() ]
                    : [ n0.toString(), d0.toString() ];

            MAX_EXP = exp;
            return arr;
        };


        /*
         * Return the value of this BigNumber converted to a number primitive.
         */
        P.toNumber = function () {
            var x = this;

            // Ensure zero has correct sign.
            return +x || ( x.s ? x.s * 0 : NaN );
        };


        /*
         * Return a BigNumber whose value is the value of this BigNumber raised to the power n.
         * If n is negative round according to DECIMAL_PLACES and ROUNDING_MODE.
         * If POW_PRECISION is not 0, round to POW_PRECISION using ROUNDING_MODE.
         *
         * n {number} Integer, -9007199254740992 to 9007199254740992 inclusive.
         * (Performs 54 loop iterations for n of 9007199254740992.)
         *
         * 'pow() exponent not an integer: {n}'
         * 'pow() exponent out of range: {n}'
         */
        P.toPower = P.pow = function (n) {
            var k, y,
                i = mathfloor( n < 0 ? -n : +n ),
                x = this;

            // Pass ±Infinity to Math.pow if exponent is out of range.
            if ( !isValidInt( n, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER, 23, 'exponent' ) &&
              ( !isFinite(n) || i > MAX_SAFE_INTEGER && ( n /= 0 ) ||
                parseFloat(n) != n && !( n = NaN ) ) ) {
                return new BigNumber( Math.pow( +x, n ) );
            }

            // Truncating each coefficient array to a length of k after each multiplication equates
            // to truncating significant digits to POW_PRECISION + [28, 41], i.e. there will be a
            // minimum of 28 guard digits retained. (Using + 1.5 would give [9, 21] guard digits.)
            k = POW_PRECISION ? mathceil( POW_PRECISION / LOG_BASE + 2 ) : 0;
            y = new BigNumber(ONE);

            for ( ; ; ) {

                if ( i % 2 ) {
                    y = y.times(x);
                    if ( !y.c ) break;
                    if ( k && y.c.length > k ) y.c.length = k;
                }

                i = mathfloor( i / 2 );
                if ( !i ) break;

                x = x.times(x);
                if ( k && x.c && x.c.length > k ) x.c.length = k;
            }

            if ( n < 0 ) y = ONE.div(y);
            return k ? round( y, POW_PRECISION, ROUNDING_MODE ) : y;
        };


        /*
         * Return a string representing the value of this BigNumber rounded to sd significant digits
         * using rounding mode rm or ROUNDING_MODE. If sd is less than the number of digits
         * necessary to represent the integer part of the value in fixed-point notation, then use
         * exponential notation.
         *
         * [sd] {number} Significant digits. Integer, 1 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toPrecision() precision not an integer: {sd}'
         * 'toPrecision() precision out of range: {sd}'
         * 'toPrecision() rounding mode not an integer: {rm}'
         * 'toPrecision() rounding mode out of range: {rm}'
         */
        P.toPrecision = function ( sd, rm ) {
            return format( this, sd != null && isValidInt( sd, 1, MAX, 24, 'precision' )
              ? sd | 0 : null, rm, 24 );
        };


        /*
         * Return a string representing the value of this BigNumber in base b, or base 10 if b is
         * omitted. If a base is specified, including base 10, round according to DECIMAL_PLACES and
         * ROUNDING_MODE. If a base is not specified, and this BigNumber has a positive exponent
         * that is equal to or greater than TO_EXP_POS, or a negative exponent equal to or less than
         * TO_EXP_NEG, return exponential notation.
         *
         * [b] {number} Integer, 2 to 64 inclusive.
         *
         * 'toString() base not an integer: {b}'
         * 'toString() base out of range: {b}'
         */
        P.toString = function (b) {
            var str,
                n = this,
                s = n.s,
                e = n.e;

            // Infinity or NaN?
            if ( e === null ) {

                if (s) {
                    str = 'Infinity';
                    if ( s < 0 ) str = '-' + str;
                } else {
                    str = 'NaN';
                }
            } else {
                str = coeffToString( n.c );

                if ( b == null || !isValidInt( b, 2, 64, 25, 'base' ) ) {
                    str = e <= TO_EXP_NEG || e >= TO_EXP_POS
                      ? toExponential( str, e )
                      : toFixedPoint( str, e );
                } else {
                    str = convertBase( toFixedPoint( str, e ), b | 0, 10, s );
                }

                if ( s < 0 && n.c[0] ) str = '-' + str;
            }

            return str;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber truncated to a whole
         * number.
         */
        P.truncated = P.trunc = function () {
            return round( new BigNumber(this), this.e + 1, 1 );
        };



        /*
         * Return as toString, but do not accept a base argument.
         */
        P.valueOf = P.toJSON = function () {
            return this.toString();
        };


        // Aliases for BigDecimal methods.
        //P.add = P.plus;         // P.add included above
        //P.subtract = P.minus;   // P.sub included above
        //P.multiply = P.times;   // P.mul included above
        //P.divide = P.div;
        //P.remainder = P.mod;
        //P.compareTo = P.cmp;
        //P.negate = P.neg;


        if ( configObj != null ) BigNumber.config(configObj);

        return BigNumber;
    }


    // PRIVATE HELPER FUNCTIONS


    function bitFloor(n) {
        var i = n | 0;
        return n > 0 || n === i ? i : i - 1;
    }


    // Return a coefficient array as a string of base 10 digits.
    function coeffToString(a) {
        var s, z,
            i = 1,
            j = a.length,
            r = a[0] + '';

        for ( ; i < j; ) {
            s = a[i++] + '';
            z = LOG_BASE - s.length;
            for ( ; z--; s = '0' + s );
            r += s;
        }

        // Determine trailing zeros.
        for ( j = r.length; r.charCodeAt(--j) === 48; );
        return r.slice( 0, j + 1 || 1 );
    }


    // Compare the value of BigNumbers x and y.
    function compare( x, y ) {
        var a, b,
            xc = x.c,
            yc = y.c,
            i = x.s,
            j = y.s,
            k = x.e,
            l = y.e;

        // Either NaN?
        if ( !i || !j ) return null;

        a = xc && !xc[0];
        b = yc && !yc[0];

        // Either zero?
        if ( a || b ) return a ? b ? 0 : -j : i;

        // Signs differ?
        if ( i != j ) return i;

        a = i < 0;
        b = k == l;

        // Either Infinity?
        if ( !xc || !yc ) return b ? 0 : !xc ^ a ? 1 : -1;

        // Compare exponents.
        if ( !b ) return k > l ^ a ? 1 : -1;

        j = ( k = xc.length ) < ( l = yc.length ) ? k : l;

        // Compare digit by digit.
        for ( i = 0; i < j; i++ ) if ( xc[i] != yc[i] ) return xc[i] > yc[i] ^ a ? 1 : -1;

        // Compare lengths.
        return k == l ? 0 : k > l ^ a ? 1 : -1;
    }


    /*
     * Return true if n is a valid number in range, otherwise false.
     * Use for argument validation when ERRORS is false.
     * Note: parseInt('1e+1') == 1 but parseFloat('1e+1') == 10.
     */
    function intValidatorNoErrors( n, min, max ) {
        return ( n = truncate(n) ) >= min && n <= max;
    }


    function isArray(obj) {
        return Object.prototype.toString.call(obj) == '[object Array]';
    }


    /*
     * Convert string of baseIn to an array of numbers of baseOut.
     * Eg. convertBase('255', 10, 16) returns [15, 15].
     * Eg. convertBase('ff', 16, 10) returns [2, 5, 5].
     */
    function toBaseOut( str, baseIn, baseOut ) {
        var j,
            arr = [0],
            arrL,
            i = 0,
            len = str.length;

        for ( ; i < len; ) {
            for ( arrL = arr.length; arrL--; arr[arrL] *= baseIn );
            arr[ j = 0 ] += ALPHABET.indexOf( str.charAt( i++ ) );

            for ( ; j < arr.length; j++ ) {

                if ( arr[j] > baseOut - 1 ) {
                    if ( arr[j + 1] == null ) arr[j + 1] = 0;
                    arr[j + 1] += arr[j] / baseOut | 0;
                    arr[j] %= baseOut;
                }
            }
        }

        return arr.reverse();
    }


    function toExponential( str, e ) {
        return ( str.length > 1 ? str.charAt(0) + '.' + str.slice(1) : str ) +
          ( e < 0 ? 'e' : 'e+' ) + e;
    }


    function toFixedPoint( str, e ) {
        var len, z;

        // Negative exponent?
        if ( e < 0 ) {

            // Prepend zeros.
            for ( z = '0.'; ++e; z += '0' );
            str = z + str;

        // Positive exponent
        } else {
            len = str.length;

            // Append zeros.
            if ( ++e > len ) {
                for ( z = '0', e -= len; --e; z += '0' );
                str += z;
            } else if ( e < len ) {
                str = str.slice( 0, e ) + '.' + str.slice(e);
            }
        }

        return str;
    }


    function truncate(n) {
        n = parseFloat(n);
        return n < 0 ? mathceil(n) : mathfloor(n);
    }


    // EXPORT


    BigNumber = another();

    // AMD.
    if ( typeof define == 'function' && define.amd ) {
        define( function () { return BigNumber; } );

    // Node and other environments that support module.exports.
    } else if ( typeof module != 'undefined' && module.exports ) {
        module.exports = BigNumber;
        if ( !crypto ) try { crypto = require('crypto'); } catch (e) {}

    // Browser.
    } else {
        global.BigNumber = BigNumber;
    }
})(this);

},{"crypto":27}],"web3":[function(require,module,exports){
var web3 = require('./lib/web3');
web3.providers.HttpProvider = require('./lib/web3/httpprovider');
web3.providers.QtSyncProvider = require('./lib/web3/qtsync');
web3.eth.contract = require('./lib/web3/contract');

// dont override global variable
if (typeof window !== 'undefined' && typeof window.web3 === 'undefined') {
    window.web3 = web3;
}

module.exports = web3;


},{"./lib/web3":8,"./lib/web3/contract":10,"./lib/web3/httpprovider":18,"./lib/web3/qtsync":23}]},{},["web3"])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvc29saWRpdHkvY29kZXIuanMiLCJsaWIvc29saWRpdHkvZm9ybWF0dGVycy5qcyIsImxpYi9zb2xpZGl0eS9wYXJhbS5qcyIsImxpYi91dGlscy9icm93c2VyLXhoci5qcyIsImxpYi91dGlscy9jb25maWcuanMiLCJsaWIvdXRpbHMvdXRpbHMuanMiLCJsaWIvdmVyc2lvbi5qc29uIiwibGliL3dlYjMuanMiLCJsaWIvd2ViMy9iYXRjaC5qcyIsImxpYi93ZWIzL2NvbnRyYWN0LmpzIiwibGliL3dlYjMvZGIuanMiLCJsaWIvd2ViMy9lcnJvcnMuanMiLCJsaWIvd2ViMy9ldGguanMiLCJsaWIvd2ViMy9ldmVudC5qcyIsImxpYi93ZWIzL2ZpbHRlci5qcyIsImxpYi93ZWIzL2Zvcm1hdHRlcnMuanMiLCJsaWIvd2ViMy9mdW5jdGlvbi5qcyIsImxpYi93ZWIzL2h0dHBwcm92aWRlci5qcyIsImxpYi93ZWIzL2pzb25ycGMuanMiLCJsaWIvd2ViMy9tZXRob2QuanMiLCJsaWIvd2ViMy9uZXQuanMiLCJsaWIvd2ViMy9wcm9wZXJ0eS5qcyIsImxpYi93ZWIzL3F0c3luYy5qcyIsImxpYi93ZWIzL3JlcXVlc3RtYW5hZ2VyLmpzIiwibGliL3dlYjMvc2hoLmpzIiwibGliL3dlYjMvd2F0Y2hlcy5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L2xpYi9fZW1wdHkuanMiLCJiaWdudW1iZXIuanMiLCJpbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNkQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIGNvZGVyLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBCaWdOdW1iZXIgPSByZXF1aXJlKCdiaWdudW1iZXIuanMnKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgZiA9IHJlcXVpcmUoJy4vZm9ybWF0dGVycycpO1xudmFyIFNvbGlkaXR5UGFyYW0gPSByZXF1aXJlKCcuL3BhcmFtJyk7XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gY2hlY2sgaWYgYSB0eXBlIGlzIGFuIGFycmF5IHR5cGVcbiAqXG4gKiBAbWV0aG9kIGlzQXJyYXlUeXBlXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybiB7Qm9vbH0gdHJ1ZSBpcyB0aGUgdHlwZSBpcyBhbiBhcnJheSwgb3RoZXJ3aXNlIGZhbHNlXG4gKi9cbnZhciBpc0FycmF5VHlwZSA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgcmV0dXJuIHR5cGUuc2xpY2UoLTIpID09PSAnW10nO1xufTtcblxuLyoqXG4gKiBTb2xpZGl0eVR5cGUgcHJvdG90eXBlIGlzIHVzZWQgdG8gZW5jb2RlL2RlY29kZSBzb2xpZGl0eSBwYXJhbXMgb2YgY2VydGFpbiB0eXBlXG4gKi9cbnZhciBTb2xpZGl0eVR5cGUgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgdGhpcy5fbmFtZSA9IGNvbmZpZy5uYW1lO1xuICAgIHRoaXMuX21hdGNoID0gY29uZmlnLm1hdGNoO1xuICAgIHRoaXMuX21vZGUgPSBjb25maWcubW9kZTtcbiAgICB0aGlzLl9pbnB1dEZvcm1hdHRlciA9IGNvbmZpZy5pbnB1dEZvcm1hdHRlcjtcbiAgICB0aGlzLl9vdXRwdXRGb3JtYXR0ZXIgPSBjb25maWcub3V0cHV0Rm9ybWF0dGVyO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBkZXRlcm1pbmUgaWYgdGhpcyBTb2xpZGl0eVR5cGUgZG8gbWF0Y2ggZ2l2ZW4gdHlwZVxuICpcbiAqIEBtZXRob2QgaXNUeXBlXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbH0gdHJ1ZSBpZiB0eXBlIG1hdGNoIHRoaXMgU29saWRpdHlUeXBlLCBvdGhlcndpc2UgZmFsc2VcbiAqL1xuU29saWRpdHlUeXBlLnByb3RvdHlwZS5pc1R5cGUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIGlmICh0aGlzLl9tYXRjaCA9PT0gJ3N0cmljdCcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX25hbWUgPT09IG5hbWUgfHwgKG5hbWUuaW5kZXhPZih0aGlzLl9uYW1lKSA9PT0gMCAmJiBuYW1lLnNsaWNlKHRoaXMuX25hbWUubGVuZ3RoKSA9PT0gJ1tdJyk7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9tYXRjaCA9PT0gJ3ByZWZpeCcpIHtcbiAgICAgICAgLy8gVE9ETyBiZXR0ZXIgdHlwZSBkZXRlY3Rpb24hXG4gICAgICAgIHJldHVybiBuYW1lLmluZGV4T2YodGhpcy5fbmFtZSkgPT09IDA7XG4gICAgfVxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byB0cmFuc2Zvcm0gcGxhaW4gcGFyYW0gdG8gU29saWRpdHlQYXJhbSBvYmplY3RcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdElucHV0XG4gKiBAcGFyYW0ge09iamVjdH0gcGFyYW0gLSBwbGFpbiBvYmplY3QsIG9yIGFuIGFycmF5IG9mIG9iamVjdHNcbiAqIEBwYXJhbSB7Qm9vbH0gYXJyYXlUeXBlIC0gdHJ1ZSBpZiBhIHBhcmFtIHNob3VsZCBiZSBlbmNvZGVkIGFzIGFuIGFycmF5XG4gKiBAcmV0dXJuIHtTb2xpZGl0eVBhcmFtfSBlbmNvZGVkIHBhcmFtIHdyYXBwZWQgaW4gU29saWRpdHlQYXJhbSBvYmplY3QgXG4gKi9cblNvbGlkaXR5VHlwZS5wcm90b3R5cGUuZm9ybWF0SW5wdXQgPSBmdW5jdGlvbiAocGFyYW0sIGFycmF5VHlwZSkge1xuICAgIGlmICh1dGlscy5pc0FycmF5KHBhcmFtKSAmJiBhcnJheVR5cGUpIHsgLy8gVE9ETzogc2hvdWxkIGZhaWwgaWYgdGhpcyB0d28gYXJlIG5vdCB0aGUgc2FtZVxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHJldHVybiBwYXJhbS5tYXAoZnVuY3Rpb24gKHApIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLl9pbnB1dEZvcm1hdHRlcihwKTtcbiAgICAgICAgfSkucmVkdWNlKGZ1bmN0aW9uIChhY2MsIGN1cnJlbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBhY2MuY29tYmluZShjdXJyZW50KTtcbiAgICAgICAgfSwgZi5mb3JtYXRJbnB1dEludChwYXJhbS5sZW5ndGgpKS53aXRoT2Zmc2V0KDMyKTtcbiAgICB9IFxuICAgIHJldHVybiB0aGlzLl9pbnB1dEZvcm1hdHRlcihwYXJhbSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIHRyYW5zb2Zvcm0gU29saWRpdHlQYXJhbSB0byBwbGFpbiBwYXJhbVxuICpcbiAqIEBtZXRob2QgZm9ybWF0T3V0cHV0XG4gKiBAcGFyYW0ge1NvbGlkaXR5UGFyYW19IGJ5dGVBcnJheVxuICogQHBhcmFtIHtCb29sfSBhcnJheVR5cGUgLSB0cnVlIGlmIGEgcGFyYW0gc2hvdWxkIGJlIGRlY29kZWQgYXMgYW4gYXJyYXlcbiAqIEByZXR1cm4ge09iamVjdH0gcGxhaW4gZGVjb2RlZCBwYXJhbVxuICovXG5Tb2xpZGl0eVR5cGUucHJvdG90eXBlLmZvcm1hdE91dHB1dCA9IGZ1bmN0aW9uIChwYXJhbSwgYXJyYXlUeXBlKSB7XG4gICAgaWYgKGFycmF5VHlwZSkge1xuICAgICAgICAvLyBsZXQncyBhc3N1bWUsIHRoYXQgd2Ugc29saWRpdHkgd2lsbCBuZXZlciByZXR1cm4gbG9uZyBhcnJheXMgOlAgXG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICAgICAgdmFyIGxlbmd0aCA9IG5ldyBCaWdOdW1iZXIocGFyYW0uZHluYW1pY1BhcnQoKS5zbGljZSgwLCA2NCksIDE2KTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGggKiA2NDsgaSArPSA2NCkge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2godGhpcy5fb3V0cHV0Rm9ybWF0dGVyKG5ldyBTb2xpZGl0eVBhcmFtKHBhcmFtLmR5bmFtaWNQYXJ0KCkuc3Vic3RyKGkgKyA2NCwgNjQpKSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9vdXRwdXRGb3JtYXR0ZXIocGFyYW0pO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBzbGljZSBzaW5nbGUgcGFyYW0gZnJvbSBieXRlc1xuICpcbiAqIEBtZXRob2Qgc2xpY2VQYXJhbVxuICogQHBhcmFtIHtTdHJpbmd9IGJ5dGVzXG4gKiBAcGFyYW0ge051bWJlcn0gaW5kZXggb2YgcGFyYW0gdG8gc2xpY2VcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcmV0dXJucyB7U29saWRpdHlQYXJhbX0gcGFyYW1cbiAqL1xuU29saWRpdHlUeXBlLnByb3RvdHlwZS5zbGljZVBhcmFtID0gZnVuY3Rpb24gKGJ5dGVzLCBpbmRleCwgdHlwZSkge1xuICAgIGlmICh0aGlzLl9tb2RlID09PSAnYnl0ZXMnKSB7XG4gICAgICAgIHJldHVybiBTb2xpZGl0eVBhcmFtLmRlY29kZUJ5dGVzKGJ5dGVzLCBpbmRleCk7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5VHlwZSh0eXBlKSkge1xuICAgICAgICByZXR1cm4gU29saWRpdHlQYXJhbS5kZWNvZGVBcnJheShieXRlcywgaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gU29saWRpdHlQYXJhbS5kZWNvZGVQYXJhbShieXRlcywgaW5kZXgpO1xufTtcblxuLyoqXG4gKiBTb2xpZGl0eUNvZGVyIHByb3RvdHlwZSBzaG91bGQgYmUgdXNlZCB0byBlbmNvZGUvZGVjb2RlIHNvbGlkaXR5IHBhcmFtcyBvZiBhbnkgdHlwZVxuICovXG52YXIgU29saWRpdHlDb2RlciA9IGZ1bmN0aW9uICh0eXBlcykge1xuICAgIHRoaXMuX3R5cGVzID0gdHlwZXM7XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSB1c2VkIHRvIHRyYW5zZm9ybSB0eXBlIHRvIFNvbGlkaXR5VHlwZVxuICpcbiAqIEBtZXRob2QgX3JlcXVpcmVUeXBlXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybnMge1NvbGlkaXR5VHlwZX0gXG4gKiBAdGhyb3dzIHtFcnJvcn0gdGhyb3dzIGlmIG5vIG1hdGNoaW5nIHR5cGUgaXMgZm91bmRcbiAqL1xuU29saWRpdHlDb2Rlci5wcm90b3R5cGUuX3JlcXVpcmVUeXBlID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICB2YXIgc29saWRpdHlUeXBlID0gdGhpcy5fdHlwZXMuZmlsdGVyKGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHJldHVybiB0LmlzVHlwZSh0eXBlKTtcbiAgICB9KVswXTtcblxuICAgIGlmICghc29saWRpdHlUeXBlKSB7XG4gICAgICAgIHRocm93IEVycm9yKCdpbnZhbGlkIHNvbGlkaXR5IHR5cGUhOiAnICsgdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNvbGlkaXR5VHlwZTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gdHJhbnNmb3JtIHBsYWluIHBhcmFtIG9mIGdpdmVuIHR5cGUgdG8gU29saWRpdHlQYXJhbVxuICpcbiAqIEBtZXRob2QgX2Zvcm1hdElucHV0XG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBvZiBwYXJhbVxuICogQHBhcmFtIHtPYmplY3R9IHBsYWluIHBhcmFtXG4gKiBAcmV0dXJuIHtTb2xpZGl0eVBhcmFtfVxuICovXG5Tb2xpZGl0eUNvZGVyLnByb3RvdHlwZS5fZm9ybWF0SW5wdXQgPSBmdW5jdGlvbiAodHlwZSwgcGFyYW0pIHtcbiAgICByZXR1cm4gdGhpcy5fcmVxdWlyZVR5cGUodHlwZSkuZm9ybWF0SW5wdXQocGFyYW0sIGlzQXJyYXlUeXBlKHR5cGUpKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZW5jb2RlIHBsYWluIHBhcmFtXG4gKlxuICogQG1ldGhvZCBlbmNvZGVQYXJhbVxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBwbGFpbiBwYXJhbVxuICogQHJldHVybiB7U3RyaW5nfSBlbmNvZGVkIHBsYWluIHBhcmFtXG4gKi9cblNvbGlkaXR5Q29kZXIucHJvdG90eXBlLmVuY29kZVBhcmFtID0gZnVuY3Rpb24gKHR5cGUsIHBhcmFtKSB7XG4gICAgcmV0dXJuIHRoaXMuX2Zvcm1hdElucHV0KHR5cGUsIHBhcmFtKS5lbmNvZGUoKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZW5jb2RlIGxpc3Qgb2YgcGFyYW1zXG4gKlxuICogQG1ldGhvZCBlbmNvZGVQYXJhbXNcbiAqIEBwYXJhbSB7QXJyYXl9IHR5cGVzXG4gKiBAcGFyYW0ge0FycmF5fSBwYXJhbXNcbiAqIEByZXR1cm4ge1N0cmluZ30gZW5jb2RlZCBsaXN0IG9mIHBhcmFtc1xuICovXG5Tb2xpZGl0eUNvZGVyLnByb3RvdHlwZS5lbmNvZGVQYXJhbXMgPSBmdW5jdGlvbiAodHlwZXMsIHBhcmFtcykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgc29saWRpdHlQYXJhbXMgPSB0eXBlcy5tYXAoZnVuY3Rpb24gKHR5cGUsIGluZGV4KSB7XG4gICAgICAgIHJldHVybiBzZWxmLl9mb3JtYXRJbnB1dCh0eXBlLCBwYXJhbXNbaW5kZXhdKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBTb2xpZGl0eVBhcmFtLmVuY29kZUxpc3Qoc29saWRpdHlQYXJhbXMpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBkZWNvZGUgYnl0ZXMgdG8gcGxhaW4gcGFyYW1cbiAqXG4gKiBAbWV0aG9kIGRlY29kZVBhcmFtXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHBhcmFtIHtTdHJpbmd9IGJ5dGVzXG4gKiBAcmV0dXJuIHtPYmplY3R9IHBsYWluIHBhcmFtXG4gKi9cblNvbGlkaXR5Q29kZXIucHJvdG90eXBlLmRlY29kZVBhcmFtID0gZnVuY3Rpb24gKHR5cGUsIGJ5dGVzKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVjb2RlUGFyYW1zKFt0eXBlXSwgYnl0ZXMpWzBdO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBkZWNvZGUgbGlzdCBvZiBwYXJhbXNcbiAqXG4gKiBAbWV0aG9kIGRlY29kZVBhcmFtXG4gKiBAcGFyYW0ge0FycmF5fSB0eXBlc1xuICogQHBhcmFtIHtTdHJpbmd9IGJ5dGVzXG4gKiBAcmV0dXJuIHtBcnJheX0gYXJyYXkgb2YgcGxhaW4gcGFyYW1zXG4gKi9cblNvbGlkaXR5Q29kZXIucHJvdG90eXBlLmRlY29kZVBhcmFtcyA9IGZ1bmN0aW9uICh0eXBlcywgYnl0ZXMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHR5cGVzLm1hcChmdW5jdGlvbiAodHlwZSwgaW5kZXgpIHtcbiAgICAgICAgdmFyIHNvbGlkaXR5VHlwZSA9IHNlbGYuX3JlcXVpcmVUeXBlKHR5cGUpO1xuICAgICAgICB2YXIgcCA9IHNvbGlkaXR5VHlwZS5zbGljZVBhcmFtKGJ5dGVzLCBpbmRleCwgdHlwZSk7XG4gICAgICAgIHJldHVybiBzb2xpZGl0eVR5cGUuZm9ybWF0T3V0cHV0KHAsIGlzQXJyYXlUeXBlKHR5cGUpKTtcbiAgICB9KTtcbn07XG5cbnZhciBjb2RlciA9IG5ldyBTb2xpZGl0eUNvZGVyKFtcbiAgICBuZXcgU29saWRpdHlUeXBlKHtcbiAgICAgICAgbmFtZTogJ2FkZHJlc3MnLFxuICAgICAgICBtYXRjaDogJ3N0cmljdCcsXG4gICAgICAgIG1vZGU6ICd2YWx1ZScsXG4gICAgICAgIGlucHV0Rm9ybWF0dGVyOiBmLmZvcm1hdElucHV0SW50LFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IGYuZm9ybWF0T3V0cHV0QWRkcmVzc1xuICAgIH0pLFxuICAgIG5ldyBTb2xpZGl0eVR5cGUoe1xuICAgICAgICBuYW1lOiAnYm9vbCcsXG4gICAgICAgIG1hdGNoOiAnc3RyaWN0JyxcbiAgICAgICAgbW9kZTogJ3ZhbHVlJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IGYuZm9ybWF0SW5wdXRCb29sLFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IGYuZm9ybWF0T3V0cHV0Qm9vbFxuICAgIH0pLFxuICAgIG5ldyBTb2xpZGl0eVR5cGUoe1xuICAgICAgICBuYW1lOiAnaW50JyxcbiAgICAgICAgbWF0Y2g6ICdwcmVmaXgnLFxuICAgICAgICBtb2RlOiAndmFsdWUnLFxuICAgICAgICBpbnB1dEZvcm1hdHRlcjogZi5mb3JtYXRJbnB1dEludCxcbiAgICAgICAgb3V0cHV0Rm9ybWF0dGVyOiBmLmZvcm1hdE91dHB1dEludCxcbiAgICB9KSxcbiAgICBuZXcgU29saWRpdHlUeXBlKHtcbiAgICAgICAgbmFtZTogJ3VpbnQnLFxuICAgICAgICBtYXRjaDogJ3ByZWZpeCcsXG4gICAgICAgIG1vZGU6ICd2YWx1ZScsXG4gICAgICAgIGlucHV0Rm9ybWF0dGVyOiBmLmZvcm1hdElucHV0SW50LFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IGYuZm9ybWF0T3V0cHV0VUludFxuICAgIH0pLFxuICAgIG5ldyBTb2xpZGl0eVR5cGUoe1xuICAgICAgICBuYW1lOiAnYnl0ZXMnLFxuICAgICAgICBtYXRjaDogJ3N0cmljdCcsXG4gICAgICAgIG1vZGU6ICdieXRlcycsXG4gICAgICAgIGlucHV0Rm9ybWF0dGVyOiBmLmZvcm1hdElucHV0RHluYW1pY0J5dGVzLFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IGYuZm9ybWF0T3V0cHV0RHluYW1pY0J5dGVzXG4gICAgfSksXG4gICAgbmV3IFNvbGlkaXR5VHlwZSh7XG4gICAgICAgIG5hbWU6ICdieXRlcycsXG4gICAgICAgIG1hdGNoOiAncHJlZml4JyxcbiAgICAgICAgbW9kZTogJ3ZhbHVlJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IGYuZm9ybWF0SW5wdXRCeXRlcyxcbiAgICAgICAgb3V0cHV0Rm9ybWF0dGVyOiBmLmZvcm1hdE91dHB1dEJ5dGVzXG4gICAgfSksXG4gICAgbmV3IFNvbGlkaXR5VHlwZSh7XG4gICAgICAgIG5hbWU6ICdyZWFsJyxcbiAgICAgICAgbWF0Y2g6ICdwcmVmaXgnLFxuICAgICAgICBtb2RlOiAndmFsdWUnLFxuICAgICAgICBpbnB1dEZvcm1hdHRlcjogZi5mb3JtYXRJbnB1dFJlYWwsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogZi5mb3JtYXRPdXRwdXRSZWFsXG4gICAgfSksXG4gICAgbmV3IFNvbGlkaXR5VHlwZSh7XG4gICAgICAgIG5hbWU6ICd1cmVhbCcsXG4gICAgICAgIG1hdGNoOiAncHJlZml4JyxcbiAgICAgICAgbW9kZTogJ3ZhbHVlJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IGYuZm9ybWF0SW5wdXRSZWFsLFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IGYuZm9ybWF0T3V0cHV0VVJlYWxcbiAgICB9KVxuXSk7XG5cbm1vZHVsZS5leHBvcnRzID0gY29kZXI7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIFxuICogQGZpbGUgZm9ybWF0dGVycy5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgQmlnTnVtYmVyID0gcmVxdWlyZSgnYmlnbnVtYmVyLmpzJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIGMgPSByZXF1aXJlKCcuLi91dGlscy9jb25maWcnKTtcbnZhciBTb2xpZGl0eVBhcmFtID0gcmVxdWlyZSgnLi9wYXJhbScpO1xuXG5cbi8qKlxuICogRm9ybWF0cyBpbnB1dCB2YWx1ZSB0byBieXRlIHJlcHJlc2VudGF0aW9uIG9mIGludFxuICogSWYgdmFsdWUgaXMgbmVnYXRpdmUsIHJldHVybiBpdCdzIHR3bydzIGNvbXBsZW1lbnRcbiAqIElmIHRoZSB2YWx1ZSBpcyBmbG9hdGluZyBwb2ludCwgcm91bmQgaXQgZG93blxuICpcbiAqIEBtZXRob2QgZm9ybWF0SW5wdXRJbnRcbiAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcnxCaWdOdW1iZXJ9IHZhbHVlIHRoYXQgbmVlZHMgdG8gYmUgZm9ybWF0dGVkXG4gKiBAcmV0dXJucyB7U29saWRpdHlQYXJhbX1cbiAqL1xudmFyIGZvcm1hdElucHV0SW50ID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIHBhZGRpbmcgPSBjLkVUSF9QQURESU5HICogMjtcbiAgICBCaWdOdW1iZXIuY29uZmlnKGMuRVRIX0JJR05VTUJFUl9ST1VORElOR19NT0RFKTtcbiAgICB2YXIgcmVzdWx0ID0gdXRpbHMucGFkTGVmdCh1dGlscy50b1R3b3NDb21wbGVtZW50KHZhbHVlKS5yb3VuZCgpLnRvU3RyaW5nKDE2KSwgcGFkZGluZyk7XG4gICAgcmV0dXJuIG5ldyBTb2xpZGl0eVBhcmFtKHJlc3VsdCk7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgaW5wdXQgdmFsdWUgdG8gYnl0ZSByZXByZXNlbnRhdGlvbiBvZiBzdHJpbmdcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdElucHV0Qnl0ZXNcbiAqIEBwYXJhbSB7U3RyaW5nfVxuICogQHJldHVybnMge1NvbGlkaXR5UGFyYW19XG4gKi9cbnZhciBmb3JtYXRJbnB1dEJ5dGVzID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIHJlc3VsdCA9IHV0aWxzLmZyb21Bc2NpaSh2YWx1ZSwgYy5FVEhfUEFERElORykuc3Vic3RyKDIpO1xuICAgIHJldHVybiBuZXcgU29saWRpdHlQYXJhbShyZXN1bHQpO1xufTtcblxuLyoqXG4gKiBGb3JtYXRzIGlucHV0IHZhbHVlIHRvIGJ5dGUgcmVwcmVzZW50YXRpb24gb2Ygc3RyaW5nXG4gKlxuICogQG1ldGhvZCBmb3JtYXRJbnB1dER5bmFtaWNCeXRlc1xuICogQHBhcmFtIHtTdHJpbmd9XG4gKiBAcmV0dXJucyB7U29saWRpdHlQYXJhbX1cbiAqL1xudmFyIGZvcm1hdElucHV0RHluYW1pY0J5dGVzID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIHJlc3VsdCA9IHV0aWxzLmZyb21Bc2NpaSh2YWx1ZSwgYy5FVEhfUEFERElORykuc3Vic3RyKDIpO1xuICAgIHJldHVybiBuZXcgU29saWRpdHlQYXJhbShmb3JtYXRJbnB1dEludCh2YWx1ZS5sZW5ndGgpLnZhbHVlICsgcmVzdWx0LCAzMik7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgaW5wdXQgdmFsdWUgdG8gYnl0ZSByZXByZXNlbnRhdGlvbiBvZiBib29sXG4gKlxuICogQG1ldGhvZCBmb3JtYXRJbnB1dEJvb2xcbiAqIEBwYXJhbSB7Qm9vbGVhbn1cbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfVxuICovXG52YXIgZm9ybWF0SW5wdXRCb29sID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIHJlc3VsdCA9ICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnICsgKHZhbHVlID8gICcxJyA6ICcwJyk7XG4gICAgcmV0dXJuIG5ldyBTb2xpZGl0eVBhcmFtKHJlc3VsdCk7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgaW5wdXQgdmFsdWUgdG8gYnl0ZSByZXByZXNlbnRhdGlvbiBvZiByZWFsXG4gKiBWYWx1ZXMgYXJlIG11bHRpcGxpZWQgYnkgMl5tIGFuZCBlbmNvZGVkIGFzIGludGVnZXJzXG4gKlxuICogQG1ldGhvZCBmb3JtYXRJbnB1dFJlYWxcbiAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcnxCaWdOdW1iZXJ9XG4gKiBAcmV0dXJucyB7U29saWRpdHlQYXJhbX1cbiAqL1xudmFyIGZvcm1hdElucHV0UmVhbCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBmb3JtYXRJbnB1dEludChuZXcgQmlnTnVtYmVyKHZhbHVlKS50aW1lcyhuZXcgQmlnTnVtYmVyKDIpLnBvdygxMjgpKSk7XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGlucHV0IHZhbHVlIGlzIG5lZ2F0aXZlXG4gKlxuICogQG1ldGhvZCBzaWduZWRJc05lZ2F0aXZlXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsdWUgaXMgaGV4IGZvcm1hdFxuICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgaXQgaXMgbmVnYXRpdmUsIG90aGVyd2lzZSBmYWxzZVxuICovXG52YXIgc2lnbmVkSXNOZWdhdGl2ZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiAobmV3IEJpZ051bWJlcih2YWx1ZS5zdWJzdHIoMCwgMSksIDE2KS50b1N0cmluZygyKS5zdWJzdHIoMCwgMSkpID09PSAnMSc7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgcmlnaHQtYWxpZ25lZCBvdXRwdXQgYnl0ZXMgdG8gaW50XG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXRJbnRcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX0gcGFyYW1cbiAqIEByZXR1cm5zIHtCaWdOdW1iZXJ9IHJpZ2h0LWFsaWduZWQgb3V0cHV0IGJ5dGVzIGZvcm1hdHRlZCB0byBiaWcgbnVtYmVyXG4gKi9cbnZhciBmb3JtYXRPdXRwdXRJbnQgPSBmdW5jdGlvbiAocGFyYW0pIHtcbiAgICB2YXIgdmFsdWUgPSBwYXJhbS5zdGF0aWNQYXJ0KCkgfHwgXCIwXCI7XG5cbiAgICAvLyBjaGVjayBpZiBpdCdzIG5lZ2F0aXZlIG51bWJlclxuICAgIC8vIGl0IGl0IGlzLCByZXR1cm4gdHdvJ3MgY29tcGxlbWVudFxuICAgIGlmIChzaWduZWRJc05lZ2F0aXZlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gbmV3IEJpZ051bWJlcih2YWx1ZSwgMTYpLm1pbnVzKG5ldyBCaWdOdW1iZXIoJ2ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYnLCAxNikpLm1pbnVzKDEpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEJpZ051bWJlcih2YWx1ZSwgMTYpO1xufTtcblxuLyoqXG4gKiBGb3JtYXRzIHJpZ2h0LWFsaWduZWQgb3V0cHV0IGJ5dGVzIHRvIHVpbnRcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dFVJbnRcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX1cbiAqIEByZXR1cm5zIHtCaWdOdW1lYmVyfSByaWdodC1hbGlnbmVkIG91dHB1dCBieXRlcyBmb3JtYXR0ZWQgdG8gdWludFxuICovXG52YXIgZm9ybWF0T3V0cHV0VUludCA9IGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIHZhciB2YWx1ZSA9IHBhcmFtLnN0YXRpY1BhcnQoKSB8fCBcIjBcIjtcbiAgICByZXR1cm4gbmV3IEJpZ051bWJlcih2YWx1ZSwgMTYpO1xufTtcblxuLyoqXG4gKiBGb3JtYXRzIHJpZ2h0LWFsaWduZWQgb3V0cHV0IGJ5dGVzIHRvIHJlYWxcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dFJlYWxcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX1cbiAqIEByZXR1cm5zIHtCaWdOdW1iZXJ9IGlucHV0IGJ5dGVzIGZvcm1hdHRlZCB0byByZWFsXG4gKi9cbnZhciBmb3JtYXRPdXRwdXRSZWFsID0gZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgcmV0dXJuIGZvcm1hdE91dHB1dEludChwYXJhbSkuZGl2aWRlZEJ5KG5ldyBCaWdOdW1iZXIoMikucG93KDEyOCkpOyBcbn07XG5cbi8qKlxuICogRm9ybWF0cyByaWdodC1hbGlnbmVkIG91dHB1dCBieXRlcyB0byB1cmVhbFxuICpcbiAqIEBtZXRob2QgZm9ybWF0T3V0cHV0VVJlYWxcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX1cbiAqIEByZXR1cm5zIHtCaWdOdW1iZXJ9IGlucHV0IGJ5dGVzIGZvcm1hdHRlZCB0byB1cmVhbFxuICovXG52YXIgZm9ybWF0T3V0cHV0VVJlYWwgPSBmdW5jdGlvbiAocGFyYW0pIHtcbiAgICByZXR1cm4gZm9ybWF0T3V0cHV0VUludChwYXJhbSkuZGl2aWRlZEJ5KG5ldyBCaWdOdW1iZXIoMikucG93KDEyOCkpOyBcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZm9ybWF0IG91dHB1dCBib29sXG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXRCb29sXG4gKiBAcGFyYW0ge1NvbGlkaXR5UGFyYW19XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gcmlnaHQtYWxpZ25lZCBpbnB1dCBieXRlcyBmb3JtYXR0ZWQgdG8gYm9vbFxuICovXG52YXIgZm9ybWF0T3V0cHV0Qm9vbCA9IGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIHJldHVybiBwYXJhbS5zdGF0aWNQYXJ0KCkgPT09ICcwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxJyA/IHRydWUgOiBmYWxzZTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZm9ybWF0IG91dHB1dCBzdHJpbmdcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dEJ5dGVzXG4gKiBAcGFyYW0ge1NvbGlkaXR5UGFyYW19IGxlZnQtYWxpZ25lZCBoZXggcmVwcmVzZW50YXRpb24gb2Ygc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBhc2NpaSBzdHJpbmdcbiAqL1xudmFyIGZvcm1hdE91dHB1dEJ5dGVzID0gZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgLy8gbGVuZ3RoIG1pZ2h0IGFsc28gYmUgaW1wb3J0YW50IVxuICAgIHJldHVybiB1dGlscy50b0FzY2lpKHBhcmFtLnN0YXRpY1BhcnQoKSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGZvcm1hdCBvdXRwdXQgc3RyaW5nXG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXREeW5hbWljQnl0ZXNcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX0gbGVmdC1hbGlnbmVkIGhleCByZXByZXNlbnRhdGlvbiBvZiBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGFzY2lpIHN0cmluZ1xuICovXG52YXIgZm9ybWF0T3V0cHV0RHluYW1pY0J5dGVzID0gZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgLy8gbGVuZ3RoIG1pZ2h0IGFsc28gYmUgaW1wb3J0YW50IVxuICAgIHJldHVybiB1dGlscy50b0FzY2lpKHBhcmFtLmR5bmFtaWNQYXJ0KCkuc2xpY2UoNjQpKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZm9ybWF0IG91dHB1dCBhZGRyZXNzXG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXRBZGRyZXNzXG4gKiBAcGFyYW0ge1NvbGlkaXR5UGFyYW19IHJpZ2h0LWFsaWduZWQgaW5wdXQgYnl0ZXNcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGFkZHJlc3NcbiAqL1xudmFyIGZvcm1hdE91dHB1dEFkZHJlc3MgPSBmdW5jdGlvbiAocGFyYW0pIHtcbiAgICB2YXIgdmFsdWUgPSBwYXJhbS5zdGF0aWNQYXJ0KCk7XG4gICAgcmV0dXJuIFwiMHhcIiArIHZhbHVlLnNsaWNlKHZhbHVlLmxlbmd0aCAtIDQwLCB2YWx1ZS5sZW5ndGgpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgZm9ybWF0SW5wdXRJbnQ6IGZvcm1hdElucHV0SW50LFxuICAgIGZvcm1hdElucHV0Qnl0ZXM6IGZvcm1hdElucHV0Qnl0ZXMsXG4gICAgZm9ybWF0SW5wdXREeW5hbWljQnl0ZXM6IGZvcm1hdElucHV0RHluYW1pY0J5dGVzLFxuICAgIGZvcm1hdElucHV0Qm9vbDogZm9ybWF0SW5wdXRCb29sLFxuICAgIGZvcm1hdElucHV0UmVhbDogZm9ybWF0SW5wdXRSZWFsLFxuICAgIGZvcm1hdE91dHB1dEludDogZm9ybWF0T3V0cHV0SW50LFxuICAgIGZvcm1hdE91dHB1dFVJbnQ6IGZvcm1hdE91dHB1dFVJbnQsXG4gICAgZm9ybWF0T3V0cHV0UmVhbDogZm9ybWF0T3V0cHV0UmVhbCxcbiAgICBmb3JtYXRPdXRwdXRVUmVhbDogZm9ybWF0T3V0cHV0VVJlYWwsXG4gICAgZm9ybWF0T3V0cHV0Qm9vbDogZm9ybWF0T3V0cHV0Qm9vbCxcbiAgICBmb3JtYXRPdXRwdXRCeXRlczogZm9ybWF0T3V0cHV0Qnl0ZXMsXG4gICAgZm9ybWF0T3V0cHV0RHluYW1pY0J5dGVzOiBmb3JtYXRPdXRwdXREeW5hbWljQnl0ZXMsXG4gICAgZm9ybWF0T3V0cHV0QWRkcmVzczogZm9ybWF0T3V0cHV0QWRkcmVzc1xufTtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogXG4gKiBAZmlsZSBwYXJhbS5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG4vKipcbiAqIFNvbGlkaXR5UGFyYW0gb2JqZWN0IHByb3RvdHlwZS5cbiAqIFNob3VsZCBiZSB1c2VkIHdoZW4gZW5jb2RpbmcsIGRlY29kaW5nIHNvbGlkaXR5IGJ5dGVzXG4gKi9cbnZhciBTb2xpZGl0eVBhcmFtID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQpIHtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWUgfHwgJyc7XG4gICAgdGhpcy5vZmZzZXQgPSBvZmZzZXQ7IC8vIG9mZnNldCBpbiBieXRlc1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgdXNlZCB0byBnZXQgbGVuZ3RoIG9mIHBhcmFtcydzIGR5bmFtaWMgcGFydFxuICogXG4gKiBAbWV0aG9kIGR5bmFtaWNQYXJ0TGVuZ3RoXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBsZW5ndGggb2YgZHluYW1pYyBwYXJ0IChpbiBieXRlcylcbiAqL1xuU29saWRpdHlQYXJhbS5wcm90b3R5cGUuZHluYW1pY1BhcnRMZW5ndGggPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuZHluYW1pY1BhcnQoKS5sZW5ndGggLyAyO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgdXNlZCB0byBjcmVhdGUgY29weSBvZiBzb2xpZGl0eSBwYXJhbSB3aXRoIGRpZmZlcmVudCBvZmZzZXRcbiAqXG4gKiBAbWV0aG9kIHdpdGhPZmZzZXRcbiAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgbGVuZ3RoIGluIGJ5dGVzXG4gKiBAcmV0dXJucyB7U29saWRpdHlQYXJhbX0gbmV3IHNvbGlkaXR5IHBhcmFtIHdpdGggYXBwbGllZCBvZmZzZXRcbiAqL1xuU29saWRpdHlQYXJhbS5wcm90b3R5cGUud2l0aE9mZnNldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgICByZXR1cm4gbmV3IFNvbGlkaXR5UGFyYW0odGhpcy52YWx1ZSwgb2Zmc2V0KTtcbn07XG5cbi8qKlxuICogVGhpcyBtZXRob2Qgc2hvdWxkIGJlIHVzZWQgdG8gY29tYmluZSBzb2xpZGl0eSBwYXJhbXMgdG9nZXRoZXJcbiAqIGVnLiB3aGVuIGFwcGVuZGluZyBhbiBhcnJheVxuICpcbiAqIEBtZXRob2QgY29tYmluZVxuICogQHBhcmFtIHtTb2xpZGl0eVBhcmFtfSBwYXJhbSB3aXRoIHdoaWNoIHdlIHNob3VsZCBjb21iaW5lXG4gKiBAcGFyYW0ge1NvbGlkaXR5UGFyYW19IHJlc3VsdCBvZiBjb21iaW5hdGlvblxuICovXG5Tb2xpZGl0eVBhcmFtLnByb3RvdHlwZS5jb21iaW5lID0gZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgcmV0dXJuIG5ldyBTb2xpZGl0eVBhcmFtKHRoaXMudmFsdWUgKyBwYXJhbS52YWx1ZSk7IFxufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgY2FsbGVkIHRvIGNoZWNrIGlmIHBhcmFtIGhhcyBkeW5hbWljIHNpemUuXG4gKiBJZiBpdCBoYXMsIGl0IHJldHVybnMgdHJ1ZSwgb3RoZXJ3aXNlIGZhbHNlXG4gKlxuICogQG1ldGhvZCBpc0R5bmFtaWNcbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5Tb2xpZGl0eVBhcmFtLnByb3RvdHlwZS5pc0R5bmFtaWMgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWUubGVuZ3RoID4gNjQgfHwgdGhpcy5vZmZzZXQgIT09IHVuZGVmaW5lZDtcbn07XG5cbi8qKlxuICogVGhpcyBtZXRob2Qgc2hvdWxkIGJlIGNhbGxlZCB0byB0cmFuc2Zvcm0gb2Zmc2V0IHRvIGJ5dGVzXG4gKlxuICogQG1ldGhvZCBvZmZzZXRBc0J5dGVzXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBieXRlcyByZXByZXNlbnRhdGlvbiBvZiBvZmZzZXRcbiAqL1xuU29saWRpdHlQYXJhbS5wcm90b3R5cGUub2Zmc2V0QXNCeXRlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNEeW5hbWljKCkgPyAnJyA6IHV0aWxzLnBhZExlZnQodXRpbHMudG9Ud29zQ29tcGxlbWVudCh0aGlzLm9mZnNldCkudG9TdHJpbmcoMTYpLCA2NCk7XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gZ2V0IHN0YXRpYyBwYXJ0IG9mIHBhcmFtXG4gKlxuICogQG1ldGhvZCBzdGF0aWNQYXJ0XG4gKiBAcmV0dXJucyB7U3RyaW5nfSBvZmZzZXQgaWYgaXQgaXMgYSBkeW5hbWljIHBhcmFtLCBvdGhlcndpc2UgdmFsdWVcbiAqL1xuU29saWRpdHlQYXJhbS5wcm90b3R5cGUuc3RhdGljUGFydCA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoIXRoaXMuaXNEeW5hbWljKCkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsdWU7IFxuICAgIH0gXG4gICAgcmV0dXJuIHRoaXMub2Zmc2V0QXNCeXRlcygpO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgY2FsbGVkIHRvIGdldCBkeW5hbWljIHBhcnQgb2YgcGFyYW1cbiAqXG4gKiBAbWV0aG9kIGR5bmFtaWNQYXJ0XG4gKiBAcmV0dXJucyB7U3RyaW5nfSByZXR1cm5zIGEgdmFsdWUgaWYgaXQgaXMgYSBkeW5hbWljIHBhcmFtLCBvdGhlcndpc2UgZW1wdHkgc3RyaW5nXG4gKi9cblNvbGlkaXR5UGFyYW0ucHJvdG90eXBlLmR5bmFtaWNQYXJ0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmlzRHluYW1pYygpID8gdGhpcy52YWx1ZSA6ICcnO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgY2FsbGVkIHRvIGVuY29kZSBwYXJhbVxuICpcbiAqIEBtZXRob2QgZW5jb2RlXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5Tb2xpZGl0eVBhcmFtLnByb3RvdHlwZS5lbmNvZGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGljUGFydCgpICsgdGhpcy5keW5hbWljUGFydCgpO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgY2FsbGVkIHRvIGVuY29kZSBhcnJheSBvZiBwYXJhbXNcbiAqXG4gKiBAbWV0aG9kIGVuY29kZUxpc3RcbiAqIEBwYXJhbSB7QXJyYXlbU29saWRpdHlQYXJhbV19IHBhcmFtc1xuICogQHJldHVybnMge1N0cmluZ31cbiAqL1xuU29saWRpdHlQYXJhbS5lbmNvZGVMaXN0ID0gZnVuY3Rpb24gKHBhcmFtcykge1xuICAgIFxuICAgIC8vIHVwZGF0aW5nIG9mZnNldHNcbiAgICB2YXIgdG90YWxPZmZzZXQgPSBwYXJhbXMubGVuZ3RoICogMzI7XG4gICAgdmFyIG9mZnNldFBhcmFtcyA9IHBhcmFtcy5tYXAoZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgICAgIGlmICghcGFyYW0uaXNEeW5hbWljKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJhbTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgb2Zmc2V0ID0gdG90YWxPZmZzZXQ7XG4gICAgICAgIHRvdGFsT2Zmc2V0ICs9IHBhcmFtLmR5bmFtaWNQYXJ0TGVuZ3RoKCk7XG4gICAgICAgIHJldHVybiBwYXJhbS53aXRoT2Zmc2V0KG9mZnNldCk7XG4gICAgfSk7XG5cbiAgICAvLyBlbmNvZGUgZXZlcnl0aGluZyFcbiAgICByZXR1cm4gb2Zmc2V0UGFyYW1zLnJlZHVjZShmdW5jdGlvbiAocmVzdWx0LCBwYXJhbSkge1xuICAgICAgICByZXR1cm4gcmVzdWx0ICsgcGFyYW0uZHluYW1pY1BhcnQoKTtcbiAgICB9LCBvZmZzZXRQYXJhbXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIHBhcmFtKSB7XG4gICAgICAgIHJldHVybiByZXN1bHQgKyBwYXJhbS5zdGF0aWNQYXJ0KCk7XG4gICAgfSwgJycpKTtcbn07XG5cbi8qKlxuICogVGhpcyBtZXRob2Qgc2hvdWxkIGJlIHVzZWQgdG8gZGVjb2RlIHBsYWluIChzdGF0aWMpIHNvbGlkaXR5IHBhcmFtIGF0IGdpdmVuIGluZGV4XG4gKlxuICogQG1ldGhvZCBkZWNvZGVQYXJhbVxuICogQHBhcmFtIHtTdHJpbmd9IGJ5dGVzXG4gKiBAcGFyYW0ge051bWJlcn0gaW5kZXhcbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfVxuICovXG5Tb2xpZGl0eVBhcmFtLmRlY29kZVBhcmFtID0gZnVuY3Rpb24gKGJ5dGVzLCBpbmRleCkge1xuICAgIGluZGV4ID0gaW5kZXggfHwgMDtcbiAgICByZXR1cm4gbmV3IFNvbGlkaXR5UGFyYW0oYnl0ZXMuc3Vic3RyKGluZGV4ICogNjQsIDY0KSk7IFxufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgY2FsbGVkIHRvIGdldCBvZmZzZXQgdmFsdWUgZnJvbSBieXRlcyBhdCBnaXZlbiBpbmRleFxuICpcbiAqIEBtZXRob2QgZ2V0T2Zmc2V0XG4gKiBAcGFyYW0ge1N0cmluZ30gYnl0ZXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBpbmRleFxuICogQHJldHVybnMge051bWJlcn0gb2Zmc2V0IGFzIG51bWJlclxuICovXG52YXIgZ2V0T2Zmc2V0ID0gZnVuY3Rpb24gKGJ5dGVzLCBpbmRleCkge1xuICAgIC8vIHdlIGNhbiBkbyB0aGlzIGNhdXNlIG9mZnNldCBpcyByYXRoZXIgc21hbGxcbiAgICByZXR1cm4gcGFyc2VJbnQoJzB4JyArIGJ5dGVzLnN1YnN0cihpbmRleCAqIDY0LCA2NCkpO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgY2FsbGVkIHRvIGRlY29kZSBzb2xpZGl0eSBieXRlcyBwYXJhbSBhdCBnaXZlbiBpbmRleFxuICpcbiAqIEBtZXRob2QgZGVjb2RlQnl0ZXNcbiAqIEBwYXJhbSB7U3RyaW5nfSBieXRlc1xuICogQHBhcmFtIHtOdW1iZXJ9IGluZGV4XG4gKiBAcmV0dXJucyB7U29saWRpdHlQYXJhbX1cbiAqL1xuU29saWRpdHlQYXJhbS5kZWNvZGVCeXRlcyA9IGZ1bmN0aW9uIChieXRlcywgaW5kZXgpIHtcbiAgICBpbmRleCA9IGluZGV4IHx8IDA7XG4gICAgLy9UT0RPIGFkZCBzdXBwb3J0IGZvciBzdHJpbmdzIGxvbmdlciB0aGFuIDMyIGJ5dGVzXG4gICAgLy92YXIgbGVuZ3RoID0gcGFyc2VJbnQoJzB4JyArIGJ5dGVzLnN1YnN0cihvZmZzZXQgKiA2NCwgNjQpKTtcblxuICAgIHZhciBvZmZzZXQgPSBnZXRPZmZzZXQoYnl0ZXMsIGluZGV4KTtcblxuICAgIC8vIDIgKiAsIGNhdXNlIHdlIGFsc28gcGFyc2UgbGVuZ3RoXG4gICAgcmV0dXJuIG5ldyBTb2xpZGl0eVBhcmFtKGJ5dGVzLnN1YnN0cihvZmZzZXQgKiAyLCAyICogNjQpLCAwKTtcbn07XG5cbi8qKlxuICogVGhpcyBtZXRob2Qgc2hvdWxkIGJlIHVzZWQgdG8gZGVjb2RlIHNvbGlkaXR5IGFycmF5IGF0IGdpdmVuIGluZGV4XG4gKlxuICogQG1ldGhvZCBkZWNvZGVBcnJheVxuICogQHBhcmFtIHtTdHJpbmd9IGJ5dGVzXG4gKiBAcGFyYW0ge051bWJlcn0gaW5kZXhcbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfVxuICovXG5Tb2xpZGl0eVBhcmFtLmRlY29kZUFycmF5ID0gZnVuY3Rpb24gKGJ5dGVzLCBpbmRleCkge1xuICAgIGluZGV4ID0gaW5kZXggfHwgMDtcbiAgICB2YXIgb2Zmc2V0ID0gZ2V0T2Zmc2V0KGJ5dGVzLCBpbmRleCk7XG4gICAgdmFyIGxlbmd0aCA9IHBhcnNlSW50KCcweCcgKyBieXRlcy5zdWJzdHIob2Zmc2V0ICogMiwgNjQpKTtcbiAgICByZXR1cm4gbmV3IFNvbGlkaXR5UGFyYW0oYnl0ZXMuc3Vic3RyKG9mZnNldCAqIDIsIChsZW5ndGggKyAxKSAqIDY0KSwgMCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNvbGlkaXR5UGFyYW07XG5cbiIsIid1c2Ugc3RyaWN0JztcblxuLy8gZ28gZW52IGRvZXNuJ3QgaGF2ZSBhbmQgbmVlZCBYTUxIdHRwUmVxdWVzdFxuaWYgKHR5cGVvZiBYTUxIdHRwUmVxdWVzdCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBleHBvcnRzLlhNTEh0dHBSZXF1ZXN0ID0ge307XG59IGVsc2Uge1xuICAgIGV4cG9ydHMuWE1MSHR0cFJlcXVlc3QgPSBYTUxIdHRwUmVxdWVzdDsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG59XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIEBmaWxlIGNvbmZpZy5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbi8qKlxuICogVXRpbHNcbiAqIFxuICogQG1vZHVsZSB1dGlsc1xuICovXG5cbi8qKlxuICogVXRpbGl0eSBmdW5jdGlvbnNcbiAqIFxuICogQGNsYXNzIFt1dGlsc10gY29uZmlnXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuXG4vLy8gcmVxdWlyZWQgdG8gZGVmaW5lIEVUSF9CSUdOVU1CRVJfUk9VTkRJTkdfTU9ERVxudmFyIEJpZ051bWJlciA9IHJlcXVpcmUoJ2JpZ251bWJlci5qcycpO1xuXG52YXIgRVRIX1VOSVRTID0gWyBcbiAgICAnd2VpJywgXG4gICAgJ0t3ZWknLCBcbiAgICAnTXdlaScsIFxuICAgICdHd2VpJywgXG4gICAgJ3N6YWJvJywgXG4gICAgJ2Zpbm5leScsIFxuICAgICdldGhlcicsIFxuICAgICdncmFuZCcsIFxuICAgICdNZXRoZXInLCBcbiAgICAnR2V0aGVyJywgXG4gICAgJ1RldGhlcicsIFxuICAgICdQZXRoZXInLCBcbiAgICAnRWV0aGVyJywgXG4gICAgJ1pldGhlcicsIFxuICAgICdZZXRoZXInLCBcbiAgICAnTmV0aGVyJywgXG4gICAgJ0RldGhlcicsIFxuICAgICdWZXRoZXInLCBcbiAgICAnVWV0aGVyJyBcbl07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEVUSF9QQURESU5HOiAzMixcbiAgICBFVEhfU0lHTkFUVVJFX0xFTkdUSDogNCxcbiAgICBFVEhfVU5JVFM6IEVUSF9VTklUUyxcbiAgICBFVEhfQklHTlVNQkVSX1JPVU5ESU5HX01PREU6IHsgUk9VTkRJTkdfTU9ERTogQmlnTnVtYmVyLlJPVU5EX0RPV04gfSxcbiAgICBFVEhfUE9MTElOR19USU1FT1VUOiAxMDAwLFxuICAgIGRlZmF1bHRCbG9jazogJ2xhdGVzdCcsXG4gICAgZGVmYXVsdEFjY291bnQ6IHVuZGVmaW5lZFxufTtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogXG4gKiBAZmlsZSB1dGlscy5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG4vKipcbiAqIFV0aWxzXG4gKiBcbiAqIEBtb2R1bGUgdXRpbHNcbiAqL1xuXG4vKipcbiAqIFV0aWxpdHkgZnVuY3Rpb25zXG4gKiBcbiAqIEBjbGFzcyBbdXRpbHNdIHV0aWxzXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuXG52YXIgQmlnTnVtYmVyID0gcmVxdWlyZSgnYmlnbnVtYmVyLmpzJyk7XG5cbnZhciB1bml0TWFwID0ge1xuICAgICd3ZWknOiAgICAgICcxJyxcbiAgICAna3dlaSc6ICAgICAnMTAwMCcsXG4gICAgJ2FkYSc6ICAgICAgJzEwMDAnLFxuICAgICdtd2VpJzogICAgICcxMDAwMDAwJyxcbiAgICAnYmFiYmFnZSc6ICAnMTAwMDAwMCcsXG4gICAgJ2d3ZWknOiAgICAgJzEwMDAwMDAwMDAnLFxuICAgICdzaGFubm9uJzogICcxMDAwMDAwMDAwJyxcbiAgICAnc3phYm8nOiAgICAnMTAwMDAwMDAwMDAwMCcsXG4gICAgJ2Zpbm5leSc6ICAgJzEwMDAwMDAwMDAwMDAwMDAnLFxuICAgICdldGhlcic6ICAgICcxMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAna2V0aGVyJzogICAnMTAwMDAwMDAwMDAwMDAwMDAwMDAwMCcsXG4gICAgJ2dyYW5kJzogICAgJzEwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICdlaW5zdGVpbic6ICcxMDAwMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnbWV0aGVyJzogICAnMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCcsXG4gICAgJ2dldGhlcic6ICAgJzEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICd0ZXRoZXInOiAgICcxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJ1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIHBhZCBzdHJpbmcgdG8gZXhwZWN0ZWQgbGVuZ3RoXG4gKlxuICogQG1ldGhvZCBwYWRMZWZ0XG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIHRvIGJlIHBhZGRlZFxuICogQHBhcmFtIHtOdW1iZXJ9IGNoYXJhY3RlcnMgdGhhdCByZXN1bHQgc3RyaW5nIHNob3VsZCBoYXZlXG4gKiBAcGFyYW0ge1N0cmluZ30gc2lnbiwgYnkgZGVmYXVsdCAwXG4gKiBAcmV0dXJucyB7U3RyaW5nfSByaWdodCBhbGlnbmVkIHN0cmluZ1xuICovXG52YXIgcGFkTGVmdCA9IGZ1bmN0aW9uIChzdHJpbmcsIGNoYXJzLCBzaWduKSB7XG4gICAgcmV0dXJuIG5ldyBBcnJheShjaGFycyAtIHN0cmluZy5sZW5ndGggKyAxKS5qb2luKHNpZ24gPyBzaWduIDogXCIwXCIpICsgc3RyaW5nO1xufTtcblxuLyoqIFxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBnZXQgc3RpbmcgZnJvbSBpdCdzIGhleCByZXByZXNlbnRhdGlvblxuICpcbiAqIEBtZXRob2QgdG9Bc2NpaVxuICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZyBpbiBoZXhcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGFzY2lpIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBoZXggdmFsdWVcbiAqL1xudmFyIHRvQXNjaWkgPSBmdW5jdGlvbihoZXgpIHtcbi8vIEZpbmQgdGVybWluYXRpb25cbiAgICB2YXIgc3RyID0gXCJcIjtcbiAgICB2YXIgaSA9IDAsIGwgPSBoZXgubGVuZ3RoO1xuICAgIGlmIChoZXguc3Vic3RyaW5nKDAsIDIpID09PSAnMHgnKSB7XG4gICAgICAgIGkgPSAyO1xuICAgIH1cbiAgICBmb3IgKDsgaSA8IGw7IGkrPTIpIHtcbiAgICAgICAgdmFyIGNvZGUgPSBwYXJzZUludChoZXguc3Vic3RyKGksIDIpLCAxNik7XG4gICAgICAgIGlmIChjb2RlID09PSAwKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIHN0ciArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUpO1xuICAgIH1cblxuICAgIHJldHVybiBzdHI7XG59O1xuICAgIFxuLyoqXG4gKiBTaG9sZCBiZSBjYWxsZWQgdG8gZ2V0IGhleCByZXByZXNlbnRhdGlvbiAocHJlZml4ZWQgYnkgMHgpIG9mIGFzY2lpIHN0cmluZyBcbiAqXG4gKiBAbWV0aG9kIHRvSGV4TmF0aXZlXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBoZXggcmVwcmVzZW50YXRpb24gb2YgaW5wdXQgc3RyaW5nXG4gKi9cbnZhciB0b0hleE5hdGl2ZSA9IGZ1bmN0aW9uKHN0cikge1xuICAgIHZhciBoZXggPSBcIlwiO1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIG4gPSBzdHIuY2hhckNvZGVBdChpKS50b1N0cmluZygxNik7XG4gICAgICAgIGhleCArPSBuLmxlbmd0aCA8IDIgPyAnMCcgKyBuIDogbjtcbiAgICB9XG5cbiAgICByZXR1cm4gaGV4O1xufTtcblxuLyoqXG4gKiBTaG9sZCBiZSBjYWxsZWQgdG8gZ2V0IGhleCByZXByZXNlbnRhdGlvbiAocHJlZml4ZWQgYnkgMHgpIG9mIGFzY2lpIHN0cmluZyBcbiAqXG4gKiBAbWV0aG9kIGZyb21Bc2NpaVxuICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZ1xuICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbmFsIHBhZGRpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGhleCByZXByZXNlbnRhdGlvbiBvZiBpbnB1dCBzdHJpbmdcbiAqL1xudmFyIGZyb21Bc2NpaSA9IGZ1bmN0aW9uKHN0ciwgcGFkKSB7XG4gICAgcGFkID0gcGFkID09PSB1bmRlZmluZWQgPyAwIDogcGFkO1xuICAgIHZhciBoZXggPSB0b0hleE5hdGl2ZShzdHIpO1xuICAgIHdoaWxlIChoZXgubGVuZ3RoIDwgcGFkKjIpXG4gICAgICAgIGhleCArPSBcIjAwXCI7XG4gICAgcmV0dXJuIFwiMHhcIiArIGhleDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gY3JlYXRlIGZ1bGwgZnVuY3Rpb24vZXZlbnQgbmFtZSBmcm9tIGpzb24gYWJpXG4gKlxuICogQG1ldGhvZCB0cmFuc2Zvcm1Ub0Z1bGxOYW1lXG4gKiBAcGFyYW0ge09iamVjdH0ganNvbi1hYmlcbiAqIEByZXR1cm4ge1N0cmluZ30gZnVsbCBmbmN0aW9uL2V2ZW50IG5hbWVcbiAqL1xudmFyIHRyYW5zZm9ybVRvRnVsbE5hbWUgPSBmdW5jdGlvbiAoanNvbikge1xuICAgIGlmIChqc29uLm5hbWUuaW5kZXhPZignKCcpICE9PSAtMSkge1xuICAgICAgICByZXR1cm4ganNvbi5uYW1lO1xuICAgIH1cblxuICAgIHZhciB0eXBlTmFtZSA9IGpzb24uaW5wdXRzLm1hcChmdW5jdGlvbihpKXtyZXR1cm4gaS50eXBlOyB9KS5qb2luKCk7XG4gICAgcmV0dXJuIGpzb24ubmFtZSArICcoJyArIHR5cGVOYW1lICsgJyknO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGdldCBkaXNwbGF5IG5hbWUgb2YgY29udHJhY3QgZnVuY3Rpb25cbiAqIFxuICogQG1ldGhvZCBleHRyYWN0RGlzcGxheU5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIGZ1bmN0aW9uL2V2ZW50XG4gKiBAcmV0dXJucyB7U3RyaW5nfSBkaXNwbGF5IG5hbWUgZm9yIGZ1bmN0aW9uL2V2ZW50IGVnLiBtdWx0aXBseSh1aW50MjU2KSAtPiBtdWx0aXBseVxuICovXG52YXIgZXh0cmFjdERpc3BsYXlOYW1lID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgbGVuZ3RoID0gbmFtZS5pbmRleE9mKCcoJyk7IFxuICAgIHJldHVybiBsZW5ndGggIT09IC0xID8gbmFtZS5zdWJzdHIoMCwgbGVuZ3RoKSA6IG5hbWU7XG59O1xuXG4vLy8gQHJldHVybnMgb3ZlcmxvYWRlZCBwYXJ0IG9mIGZ1bmN0aW9uL2V2ZW50IG5hbWVcbnZhciBleHRyYWN0VHlwZU5hbWUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIC8vLyBUT0RPOiBtYWtlIGl0IGludnVsbmVyYWJsZVxuICAgIHZhciBsZW5ndGggPSBuYW1lLmluZGV4T2YoJygnKTtcbiAgICByZXR1cm4gbGVuZ3RoICE9PSAtMSA/IG5hbWUuc3Vic3RyKGxlbmd0aCArIDEsIG5hbWUubGVuZ3RoIC0gMSAtIChsZW5ndGggKyAxKSkucmVwbGFjZSgnICcsICcnKSA6IFwiXCI7XG59O1xuXG4vKipcbiAqIENvbnZlcnRzIHZhbHVlIHRvIGl0J3MgZGVjaW1hbCByZXByZXNlbnRhdGlvbiBpbiBzdHJpbmdcbiAqXG4gKiBAbWV0aG9kIHRvRGVjaW1hbFxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfEJpZ051bWJlcn1cbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xudmFyIHRvRGVjaW1hbCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiB0b0JpZ051bWJlcih2YWx1ZSkudG9OdW1iZXIoKTtcbn07XG5cbi8qKlxuICogQ29udmVydHMgdmFsdWUgdG8gaXQncyBoZXggcmVwcmVzZW50YXRpb25cbiAqXG4gKiBAbWV0aG9kIGZyb21EZWNpbWFsXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ8QmlnTnVtYmVyfVxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG52YXIgZnJvbURlY2ltYWwgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgbnVtYmVyID0gdG9CaWdOdW1iZXIodmFsdWUpO1xuICAgIHZhciByZXN1bHQgPSBudW1iZXIudG9TdHJpbmcoMTYpO1xuXG4gICAgcmV0dXJuIG51bWJlci5sZXNzVGhhbigwKSA/ICctMHgnICsgcmVzdWx0LnN1YnN0cigxKSA6ICcweCcgKyByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEF1dG8gY29udmVydHMgYW55IGdpdmVuIHZhbHVlIGludG8gaXQncyBoZXggcmVwcmVzZW50YXRpb24uXG4gKlxuICogQW5kIGV2ZW4gc3RyaW5naWZ5cyBvYmplY3RzIGJlZm9yZS5cbiAqXG4gKiBAbWV0aG9kIHRvSGV4XG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ8QmlnTnVtYmVyfE9iamVjdH1cbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xudmFyIHRvSGV4ID0gZnVuY3Rpb24gKHZhbCkge1xuICAgIC8qanNoaW50IG1heGNvbXBsZXhpdHk6NyAqL1xuXG4gICAgaWYgKGlzQm9vbGVhbih2YWwpKVxuICAgICAgICByZXR1cm4gZnJvbURlY2ltYWwoK3ZhbCk7XG5cbiAgICBpZiAoaXNCaWdOdW1iZXIodmFsKSlcbiAgICAgICAgcmV0dXJuIGZyb21EZWNpbWFsKHZhbCk7XG5cbiAgICBpZiAoaXNPYmplY3QodmFsKSlcbiAgICAgICAgcmV0dXJuIGZyb21Bc2NpaShKU09OLnN0cmluZ2lmeSh2YWwpKTtcblxuICAgIC8vIGlmIGl0cyBhIG5lZ2F0aXZlIG51bWJlciwgcGFzcyBpdCB0aHJvdWdoIGZyb21EZWNpbWFsXG4gICAgaWYgKGlzU3RyaW5nKHZhbCkpIHtcbiAgICAgICAgaWYgKHZhbC5pbmRleE9mKCctMHgnKSA9PT0gMClcbiAgICAgICAgICAgcmV0dXJuIGZyb21EZWNpbWFsKHZhbCk7XG4gICAgICAgIGVsc2UgaWYgKCFpc0Zpbml0ZSh2YWwpKVxuICAgICAgICAgICAgcmV0dXJuIGZyb21Bc2NpaSh2YWwpO1xuICAgIH1cblxuICAgIHJldHVybiBmcm9tRGVjaW1hbCh2YWwpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHZhbHVlIG9mIHVuaXQgaW4gV2VpXG4gKlxuICogQG1ldGhvZCBnZXRWYWx1ZU9mVW5pdFxuICogQHBhcmFtIHtTdHJpbmd9IHVuaXQgdGhlIHVuaXQgdG8gY29udmVydCB0bywgZGVmYXVsdCBldGhlclxuICogQHJldHVybnMge0JpZ051bWJlcn0gdmFsdWUgb2YgdGhlIHVuaXQgKGluIFdlaSlcbiAqIEB0aHJvd3MgZXJyb3IgaWYgdGhlIHVuaXQgaXMgbm90IGNvcnJlY3Q6d1xuICovXG52YXIgZ2V0VmFsdWVPZlVuaXQgPSBmdW5jdGlvbiAodW5pdCkge1xuICAgIHVuaXQgPSB1bml0ID8gdW5pdC50b0xvd2VyQ2FzZSgpIDogJ2V0aGVyJztcbiAgICB2YXIgdW5pdFZhbHVlID0gdW5pdE1hcFt1bml0XTtcbiAgICBpZiAodW5pdFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGlzIHVuaXQgZG9lc25cXCd0IGV4aXN0cywgcGxlYXNlIHVzZSB0aGUgb25lIG9mIHRoZSBmb2xsb3dpbmcgdW5pdHMnICsgSlNPTi5zdHJpbmdpZnkodW5pdE1hcCwgbnVsbCwgMikpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEJpZ051bWJlcih1bml0VmFsdWUsIDEwKTtcbn07XG5cbi8qKlxuICogVGFrZXMgYSBudW1iZXIgb2Ygd2VpIGFuZCBjb252ZXJ0cyBpdCB0byBhbnkgb3RoZXIgZXRoZXIgdW5pdC5cbiAqXG4gKiBQb3NzaWJsZSB1bml0cyBhcmU6XG4gKiAtIGt3ZWkvYWRhXG4gKiAtIG13ZWkvYmFiYmFnZVxuICogLSBnd2VpL3NoYW5ub25cbiAqIC0gc3phYm9cbiAqIC0gZmlubmV5XG4gKiAtIGV0aGVyXG4gKiAtIGtldGhlci9ncmFuZC9laW5zdGVpblxuICogLSBtZXRoZXJcbiAqIC0gZ2V0aGVyXG4gKiAtIHRldGhlclxuICpcbiAqIEBtZXRob2QgZnJvbVdlaVxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfSBudW1iZXIgY2FuIGJlIGEgbnVtYmVyLCBudW1iZXIgc3RyaW5nIG9yIGEgSEVYIG9mIGEgZGVjaW1hbFxuICogQHBhcmFtIHtTdHJpbmd9IHVuaXQgdGhlIHVuaXQgdG8gY29udmVydCB0bywgZGVmYXVsdCBldGhlclxuICogQHJldHVybiB7U3RyaW5nfE9iamVjdH0gV2hlbiBnaXZlbiBhIEJpZ051bWJlciBvYmplY3QgaXQgcmV0dXJucyBvbmUgYXMgd2VsbCwgb3RoZXJ3aXNlIGEgbnVtYmVyXG4qL1xudmFyIGZyb21XZWkgPSBmdW5jdGlvbihudW1iZXIsIHVuaXQpIHtcbiAgICB2YXIgcmV0dXJuVmFsdWUgPSB0b0JpZ051bWJlcihudW1iZXIpLmRpdmlkZWRCeShnZXRWYWx1ZU9mVW5pdCh1bml0KSk7XG5cbiAgICByZXR1cm4gaXNCaWdOdW1iZXIobnVtYmVyKSA/IHJldHVyblZhbHVlIDogcmV0dXJuVmFsdWUudG9TdHJpbmcoMTApOyBcbn07XG5cbi8qKlxuICogVGFrZXMgYSBudW1iZXIgb2YgYSB1bml0IGFuZCBjb252ZXJ0cyBpdCB0byB3ZWkuXG4gKlxuICogUG9zc2libGUgdW5pdHMgYXJlOlxuICogLSBrd2VpL2FkYVxuICogLSBtd2VpL2JhYmJhZ2VcbiAqIC0gZ3dlaS9zaGFubm9uXG4gKiAtIHN6YWJvXG4gKiAtIGZpbm5leVxuICogLSBldGhlclxuICogLSBrZXRoZXIvZ3JhbmQvZWluc3RlaW5cbiAqIC0gbWV0aGVyXG4gKiAtIGdldGhlclxuICogLSB0ZXRoZXJcbiAqXG4gKiBAbWV0aG9kIHRvV2VpXG4gKiBAcGFyYW0ge051bWJlcnxTdHJpbmd8QmlnTnVtYmVyfSBudW1iZXIgY2FuIGJlIGEgbnVtYmVyLCBudW1iZXIgc3RyaW5nIG9yIGEgSEVYIG9mIGEgZGVjaW1hbFxuICogQHBhcmFtIHtTdHJpbmd9IHVuaXQgdGhlIHVuaXQgdG8gY29udmVydCBmcm9tLCBkZWZhdWx0IGV0aGVyXG4gKiBAcmV0dXJuIHtTdHJpbmd8T2JqZWN0fSBXaGVuIGdpdmVuIGEgQmlnTnVtYmVyIG9iamVjdCBpdCByZXR1cm5zIG9uZSBhcyB3ZWxsLCBvdGhlcndpc2UgYSBudW1iZXJcbiovXG52YXIgdG9XZWkgPSBmdW5jdGlvbihudW1iZXIsIHVuaXQpIHtcbiAgICB2YXIgcmV0dXJuVmFsdWUgPSB0b0JpZ051bWJlcihudW1iZXIpLnRpbWVzKGdldFZhbHVlT2ZVbml0KHVuaXQpKTtcblxuICAgIHJldHVybiBpc0JpZ051bWJlcihudW1iZXIpID8gcmV0dXJuVmFsdWUgOiByZXR1cm5WYWx1ZS50b1N0cmluZygxMCk7IFxufTtcblxuLyoqXG4gKiBUYWtlcyBhbiBpbnB1dCBhbmQgdHJhbnNmb3JtcyBpdCBpbnRvIGFuIGJpZ251bWJlclxuICpcbiAqIEBtZXRob2QgdG9CaWdOdW1iZXJcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ3xCaWdOdW1iZXJ9IGEgbnVtYmVyLCBzdHJpbmcsIEhFWCBzdHJpbmcgb3IgQmlnTnVtYmVyXG4gKiBAcmV0dXJuIHtCaWdOdW1iZXJ9IEJpZ051bWJlclxuKi9cbnZhciB0b0JpZ051bWJlciA9IGZ1bmN0aW9uKG51bWJlcikge1xuICAgIC8qanNoaW50IG1heGNvbXBsZXhpdHk6NSAqL1xuICAgIG51bWJlciA9IG51bWJlciB8fCAwO1xuICAgIGlmIChpc0JpZ051bWJlcihudW1iZXIpKVxuICAgICAgICByZXR1cm4gbnVtYmVyO1xuXG4gICAgaWYgKGlzU3RyaW5nKG51bWJlcikgJiYgKG51bWJlci5pbmRleE9mKCcweCcpID09PSAwIHx8IG51bWJlci5pbmRleE9mKCctMHgnKSA9PT0gMCkpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCaWdOdW1iZXIobnVtYmVyLnJlcGxhY2UoJzB4JywnJyksIDE2KTtcbiAgICB9XG4gICBcbiAgICByZXR1cm4gbmV3IEJpZ051bWJlcihudW1iZXIudG9TdHJpbmcoMTApLCAxMCk7XG59O1xuXG4vKipcbiAqIFRha2VzIGFuZCBpbnB1dCB0cmFuc2Zvcm1zIGl0IGludG8gYmlnbnVtYmVyIGFuZCBpZiBpdCBpcyBuZWdhdGl2ZSB2YWx1ZSwgaW50byB0d28ncyBjb21wbGVtZW50XG4gKlxuICogQG1ldGhvZCB0b1R3b3NDb21wbGVtZW50XG4gKiBAcGFyYW0ge051bWJlcnxTdHJpbmd8QmlnTnVtYmVyfVxuICogQHJldHVybiB7QmlnTnVtYmVyfVxuICovXG52YXIgdG9Ud29zQ29tcGxlbWVudCA9IGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICB2YXIgYmlnTnVtYmVyID0gdG9CaWdOdW1iZXIobnVtYmVyKTtcbiAgICBpZiAoYmlnTnVtYmVyLmxlc3NUaGFuKDApKSB7XG4gICAgICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKFwiZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZlwiLCAxNikucGx1cyhiaWdOdW1iZXIpLnBsdXMoMSk7XG4gICAgfVxuICAgIHJldHVybiBiaWdOdW1iZXI7XG59O1xuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIHN0cmljdGx5IGFuIGFkZHJlc3NcbiAqXG4gKiBAbWV0aG9kIGlzU3RyaWN0QWRkcmVzc1xuICogQHBhcmFtIHtTdHJpbmd9IGFkZHJlc3MgdGhlIGdpdmVuIEhFWCBhZHJlc3NcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4qL1xudmFyIGlzU3RyaWN0QWRkcmVzcyA9IGZ1bmN0aW9uIChhZGRyZXNzKSB7XG4gICAgcmV0dXJuIC9eMHhbMC05YS1mXXs0MH0kLy50ZXN0KGFkZHJlc3MpO1xufTtcblxuLyoqXG4gKiBDaGVja3MgaWYgdGhlIGdpdmVuIHN0cmluZyBpcyBhbiBhZGRyZXNzXG4gKlxuICogQG1ldGhvZCBpc0FkZHJlc3NcbiAqIEBwYXJhbSB7U3RyaW5nfSBhZGRyZXNzIHRoZSBnaXZlbiBIRVggYWRyZXNzXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuKi9cbnZhciBpc0FkZHJlc3MgPSBmdW5jdGlvbiAoYWRkcmVzcykge1xuICAgIHJldHVybiAvXigweCk/WzAtOWEtZl17NDB9JC8udGVzdChhZGRyZXNzKTtcbn07XG5cbi8qKlxuICogVHJhbnNmb3JtcyBnaXZlbiBzdHJpbmcgdG8gdmFsaWQgMjAgYnl0ZXMtbGVuZ3RoIGFkZHJlcyB3aXRoIDB4IHByZWZpeFxuICpcbiAqIEBtZXRob2QgdG9BZGRyZXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gYWRkcmVzc1xuICogQHJldHVybiB7U3RyaW5nfSBmb3JtYXR0ZWQgYWRkcmVzc1xuICovXG52YXIgdG9BZGRyZXNzID0gZnVuY3Rpb24gKGFkZHJlc3MpIHtcbiAgICBpZiAoaXNTdHJpY3RBZGRyZXNzKGFkZHJlc3MpKSB7XG4gICAgICAgIHJldHVybiBhZGRyZXNzO1xuICAgIH1cbiAgICBcbiAgICBpZiAoL15bMC05YS1mXXs0MH0kLy50ZXN0KGFkZHJlc3MpKSB7XG4gICAgICAgIHJldHVybiAnMHgnICsgYWRkcmVzcztcbiAgICB9XG5cbiAgICByZXR1cm4gJzB4JyArIHBhZExlZnQodG9IZXgoYWRkcmVzcykuc3Vic3RyKDIpLCA0MCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIG9iamVjdCBpcyBCaWdOdW1iZXIsIG90aGVyd2lzZSBmYWxzZVxuICpcbiAqIEBtZXRob2QgaXNCaWdOdW1iZXJcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHJldHVybiB7Qm9vbGVhbn0gXG4gKi9cbnZhciBpc0JpZ051bWJlciA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgQmlnTnVtYmVyIHx8XG4gICAgICAgIChvYmplY3QgJiYgb2JqZWN0LmNvbnN0cnVjdG9yICYmIG9iamVjdC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnQmlnTnVtYmVyJyk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBvYmplY3QgaXMgc3RyaW5nLCBvdGhlcndpc2UgZmFsc2VcbiAqIFxuICogQG1ldGhvZCBpc1N0cmluZ1xuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICovXG52YXIgaXNTdHJpbmcgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChvYmplY3QgJiYgb2JqZWN0LmNvbnN0cnVjdG9yICYmIG9iamVjdC5jb25zdHJ1Y3Rvci5uYW1lID09PSAnU3RyaW5nJyk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBvYmplY3QgaXMgZnVuY3Rpb24sIG90aGVyd2lzZSBmYWxzZVxuICpcbiAqIEBtZXRob2QgaXNGdW5jdGlvblxuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICovXG52YXIgaXNGdW5jdGlvbiA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIG9iamVjdCBpcyBPYmpldCwgb3RoZXJ3aXNlIGZhbHNlXG4gKlxuICogQG1ldGhvZCBpc09iamVjdFxuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICovXG52YXIgaXNPYmplY3QgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgb2JqZWN0IGlzIGJvb2xlYW4sIG90aGVyd2lzZSBmYWxzZVxuICpcbiAqIEBtZXRob2QgaXNCb29sZWFuXG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKi9cbnZhciBpc0Jvb2xlYW4gPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdib29sZWFuJztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIG9iamVjdCBpcyBhcnJheSwgb3RoZXJ3aXNlIGZhbHNlXG4gKlxuICogQG1ldGhvZCBpc0FycmF5XG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKi9cbnZhciBpc0FycmF5ID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBBcnJheTsgXG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBnaXZlbiBzdHJpbmcgaXMgdmFsaWQganNvbiBvYmplY3RcbiAqIFxuICogQG1ldGhvZCBpc0pzb25cbiAqIEBwYXJhbSB7U3RyaW5nfVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqL1xudmFyIGlzSnNvbiA9IGZ1bmN0aW9uIChzdHIpIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gISFKU09OLnBhcnNlKHN0cik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgcGFkTGVmdDogcGFkTGVmdCxcbiAgICB0b0hleDogdG9IZXgsXG4gICAgdG9EZWNpbWFsOiB0b0RlY2ltYWwsXG4gICAgZnJvbURlY2ltYWw6IGZyb21EZWNpbWFsLFxuICAgIHRvQXNjaWk6IHRvQXNjaWksXG4gICAgZnJvbUFzY2lpOiBmcm9tQXNjaWksXG4gICAgdHJhbnNmb3JtVG9GdWxsTmFtZTogdHJhbnNmb3JtVG9GdWxsTmFtZSxcbiAgICBleHRyYWN0RGlzcGxheU5hbWU6IGV4dHJhY3REaXNwbGF5TmFtZSxcbiAgICBleHRyYWN0VHlwZU5hbWU6IGV4dHJhY3RUeXBlTmFtZSxcbiAgICB0b1dlaTogdG9XZWksXG4gICAgZnJvbVdlaTogZnJvbVdlaSxcbiAgICB0b0JpZ051bWJlcjogdG9CaWdOdW1iZXIsXG4gICAgdG9Ud29zQ29tcGxlbWVudDogdG9Ud29zQ29tcGxlbWVudCxcbiAgICB0b0FkZHJlc3M6IHRvQWRkcmVzcyxcbiAgICBpc0JpZ051bWJlcjogaXNCaWdOdW1iZXIsXG4gICAgaXNTdHJpY3RBZGRyZXNzOiBpc1N0cmljdEFkZHJlc3MsXG4gICAgaXNBZGRyZXNzOiBpc0FkZHJlc3MsXG4gICAgaXNGdW5jdGlvbjogaXNGdW5jdGlvbixcbiAgICBpc1N0cmluZzogaXNTdHJpbmcsXG4gICAgaXNPYmplY3Q6IGlzT2JqZWN0LFxuICAgIGlzQm9vbGVhbjogaXNCb29sZWFuLFxuICAgIGlzQXJyYXk6IGlzQXJyYXksXG4gICAgaXNKc29uOiBpc0pzb25cbn07XG5cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcInZlcnNpb25cIjogXCIwLjQuM1wiXG59XG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBAZmlsZSB3ZWIzLmpzXG4gKiBAYXV0aG9yczpcbiAqICAgSmVmZnJleSBXaWxja2UgPGplZmZAZXRoZGV2LmNvbT5cbiAqICAgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiAgIE1hcmlhbiBPYW5jZWEgPG1hcmlhbkBldGhkZXYuY29tPlxuICogICBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZXRoZGV2LmNvbT5cbiAqICAgR2F2IFdvb2QgPGdAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTRcbiAqL1xuXG52YXIgdmVyc2lvbiA9IHJlcXVpcmUoJy4vdmVyc2lvbi5qc29uJyk7XG52YXIgbmV0ID0gcmVxdWlyZSgnLi93ZWIzL25ldCcpO1xudmFyIGV0aCA9IHJlcXVpcmUoJy4vd2ViMy9ldGgnKTtcbnZhciBkYiA9IHJlcXVpcmUoJy4vd2ViMy9kYicpO1xudmFyIHNoaCA9IHJlcXVpcmUoJy4vd2ViMy9zaGgnKTtcbnZhciB3YXRjaGVzID0gcmVxdWlyZSgnLi93ZWIzL3dhdGNoZXMnKTtcbnZhciBGaWx0ZXIgPSByZXF1aXJlKCcuL3dlYjMvZmlsdGVyJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzL3V0aWxzJyk7XG52YXIgZm9ybWF0dGVycyA9IHJlcXVpcmUoJy4vd2ViMy9mb3JtYXR0ZXJzJyk7XG52YXIgUmVxdWVzdE1hbmFnZXIgPSByZXF1aXJlKCcuL3dlYjMvcmVxdWVzdG1hbmFnZXInKTtcbnZhciBjID0gcmVxdWlyZSgnLi91dGlscy9jb25maWcnKTtcbnZhciBNZXRob2QgPSByZXF1aXJlKCcuL3dlYjMvbWV0aG9kJyk7XG52YXIgUHJvcGVydHkgPSByZXF1aXJlKCcuL3dlYjMvcHJvcGVydHknKTtcbnZhciBCYXRjaCA9IHJlcXVpcmUoJy4vd2ViMy9iYXRjaCcpO1xuXG52YXIgd2ViM01ldGhvZHMgPSBbXG4gICAgbmV3IE1ldGhvZCh7XG4gICAgICAgIG5hbWU6ICdzaGEzJyxcbiAgICAgICAgY2FsbDogJ3dlYjNfc2hhMycsXG4gICAgICAgIHBhcmFtczogMVxuICAgIH0pXG5dO1xuXG52YXIgd2ViM1Byb3BlcnRpZXMgPSBbXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ3ZlcnNpb24uY2xpZW50JyxcbiAgICAgICAgZ2V0dGVyOiAnd2ViM19jbGllbnRWZXJzaW9uJ1xuICAgIH0pLFxuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICd2ZXJzaW9uLm5ldHdvcmsnLFxuICAgICAgICBnZXR0ZXI6ICduZXRfdmVyc2lvbicsXG4gICAgICAgIGlucHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbiAgICB9KSxcbiAgICBuZXcgUHJvcGVydHkoe1xuICAgICAgICBuYW1lOiAndmVyc2lvbi5ldGhlcmV1bScsXG4gICAgICAgIGdldHRlcjogJ2V0aF9wcm90b2NvbFZlcnNpb24nLFxuICAgICAgICBpbnB1dEZvcm1hdHRlcjogdXRpbHMudG9EZWNpbWFsXG4gICAgfSksXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ3ZlcnNpb24ud2hpc3BlcicsXG4gICAgICAgIGdldHRlcjogJ3NoaF92ZXJzaW9uJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IHV0aWxzLnRvRGVjaW1hbFxuICAgIH0pXG5dO1xuXG4vLy8gY3JlYXRlcyBtZXRob2RzIGluIGEgZ2l2ZW4gb2JqZWN0IGJhc2VkIG9uIG1ldGhvZCBkZXNjcmlwdGlvbiBvbiBpbnB1dFxuLy8vIHNldHVwcyBhcGkgY2FsbHMgZm9yIHRoZXNlIG1ldGhvZHNcbnZhciBzZXR1cE1ldGhvZHMgPSBmdW5jdGlvbiAob2JqLCBtZXRob2RzKSB7XG4gICAgbWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgICAgICAgbWV0aG9kLmF0dGFjaFRvT2JqZWN0KG9iaik7XG4gICAgfSk7XG59O1xuXG4vLy8gY3JlYXRlcyBwcm9wZXJ0aWVzIGluIGEgZ2l2ZW4gb2JqZWN0IGJhc2VkIG9uIHByb3BlcnRpZXMgZGVzY3JpcHRpb24gb24gaW5wdXRcbi8vLyBzZXR1cHMgYXBpIGNhbGxzIGZvciB0aGVzZSBwcm9wZXJ0aWVzXG52YXIgc2V0dXBQcm9wZXJ0aWVzID0gZnVuY3Rpb24gKG9iaiwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbiAocHJvcGVydHkpIHtcbiAgICAgICAgcHJvcGVydHkuYXR0YWNoVG9PYmplY3Qob2JqKTtcbiAgICB9KTtcbn07XG5cbi8vLyBzZXR1cHMgd2ViMyBvYmplY3QsIGFuZCBpdCdzIGluLWJyb3dzZXIgZXhlY3V0ZWQgbWV0aG9kc1xudmFyIHdlYjMgPSB7fTtcbndlYjMucHJvdmlkZXJzID0ge307XG53ZWIzLnZlcnNpb24gPSB7fTtcbndlYjMudmVyc2lvbi5hcGkgPSB2ZXJzaW9uLnZlcnNpb247XG53ZWIzLmV0aCA9IHt9O1xuXG4vKmpzaGludCBtYXhwYXJhbXM6NCAqL1xud2ViMy5ldGguZmlsdGVyID0gZnVuY3Rpb24gKGZpbCwgZXZlbnRQYXJhbXMsIG9wdGlvbnMsIGZvcm1hdHRlcikge1xuXG4gICAgLy8gaWYgaXRzIGV2ZW50LCB0cmVhdCBpdCBkaWZmZXJlbnRseVxuICAgIC8vIFRPRE86IHNpbXBsaWZ5IGFuZCByZW1vdmVcbiAgICBpZiAoZmlsLl9pc0V2ZW50KSB7XG4gICAgICAgIHJldHVybiBmaWwoZXZlbnRQYXJhbXMsIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIC8vIHdoYXQgb3V0cHV0TG9nRm9ybWF0dGVyPyB0aGF0J3Mgd3JvbmdcbiAgICAvL3JldHVybiBuZXcgRmlsdGVyKGZpbCwgd2F0Y2hlcy5ldGgoKSwgZm9ybWF0dGVycy5vdXRwdXRMb2dGb3JtYXR0ZXIpO1xuICAgIHJldHVybiBuZXcgRmlsdGVyKGZpbCwgd2F0Y2hlcy5ldGgoKSwgZm9ybWF0dGVyIHx8IGZvcm1hdHRlcnMub3V0cHV0TG9nRm9ybWF0dGVyKTtcbn07XG4vKmpzaGludCBtYXhwYXJhbXM6MyAqL1xuXG53ZWIzLnNoaCA9IHt9O1xud2ViMy5zaGguZmlsdGVyID0gZnVuY3Rpb24gKGZpbCkge1xuICAgIHJldHVybiBuZXcgRmlsdGVyKGZpbCwgd2F0Y2hlcy5zaGgoKSwgZm9ybWF0dGVycy5vdXRwdXRQb3N0Rm9ybWF0dGVyKTtcbn07XG53ZWIzLm5ldCA9IHt9O1xud2ViMy5kYiA9IHt9O1xud2ViMy5zZXRQcm92aWRlciA9IGZ1bmN0aW9uIChwcm92aWRlcikge1xuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc2V0UHJvdmlkZXIocHJvdmlkZXIpO1xufTtcbndlYjMucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UoKS5yZXNldCgpO1xuICAgIGMuZGVmYXVsdEJsb2NrID0gJ2xhdGVzdCc7XG4gICAgYy5kZWZhdWx0QWNjb3VudCA9IHVuZGVmaW5lZDtcbn07XG53ZWIzLnRvSGV4ID0gdXRpbHMudG9IZXg7XG53ZWIzLnRvQXNjaWkgPSB1dGlscy50b0FzY2lpO1xud2ViMy5mcm9tQXNjaWkgPSB1dGlscy5mcm9tQXNjaWk7XG53ZWIzLnRvRGVjaW1hbCA9IHV0aWxzLnRvRGVjaW1hbDtcbndlYjMuZnJvbURlY2ltYWwgPSB1dGlscy5mcm9tRGVjaW1hbDtcbndlYjMudG9CaWdOdW1iZXIgPSB1dGlscy50b0JpZ051bWJlcjtcbndlYjMudG9XZWkgPSB1dGlscy50b1dlaTtcbndlYjMuZnJvbVdlaSA9IHV0aWxzLmZyb21XZWk7XG53ZWIzLmlzQWRkcmVzcyA9IHV0aWxzLmlzQWRkcmVzcztcbndlYjMuY3JlYXRlQmF0Y2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBCYXRjaCgpO1xufTtcblxuLy8gQUREIGRlZmF1bHRibG9ja1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KHdlYjMuZXRoLCAnZGVmYXVsdEJsb2NrJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYy5kZWZhdWx0QmxvY2s7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgYy5kZWZhdWx0QmxvY2sgPSB2YWw7XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3ZWIzLmV0aCwgJ2RlZmF1bHRBY2NvdW50Jywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYy5kZWZhdWx0QWNjb3VudDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICBjLmRlZmF1bHRBY2NvdW50ID0gdmFsO1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn0pO1xuXG4vLy8gc2V0dXBzIGFsbCBhcGkgbWV0aG9kc1xuc2V0dXBNZXRob2RzKHdlYjMsIHdlYjNNZXRob2RzKTtcbnNldHVwUHJvcGVydGllcyh3ZWIzLCB3ZWIzUHJvcGVydGllcyk7XG5zZXR1cE1ldGhvZHMod2ViMy5uZXQsIG5ldC5tZXRob2RzKTtcbnNldHVwUHJvcGVydGllcyh3ZWIzLm5ldCwgbmV0LnByb3BlcnRpZXMpO1xuc2V0dXBNZXRob2RzKHdlYjMuZXRoLCBldGgubWV0aG9kcyk7XG5zZXR1cFByb3BlcnRpZXMod2ViMy5ldGgsIGV0aC5wcm9wZXJ0aWVzKTtcbnNldHVwTWV0aG9kcyh3ZWIzLmRiLCBkYi5tZXRob2RzKTtcbnNldHVwTWV0aG9kcyh3ZWIzLnNoaCwgc2hoLm1ldGhvZHMpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHdlYjM7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIFxuICogQGZpbGUgYmF0Y2guanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE1XG4gKi9cblxudmFyIFJlcXVlc3RNYW5hZ2VyID0gcmVxdWlyZSgnLi9yZXF1ZXN0bWFuYWdlcicpO1xuXG52YXIgQmF0Y2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5yZXF1ZXN0cyA9IFtdO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGFkZCBjcmVhdGUgbmV3IHJlcXVlc3QgdG8gYmF0Y2ggcmVxdWVzdFxuICpcbiAqIEBtZXRob2QgYWRkXG4gKiBAcGFyYW0ge09iamVjdH0ganNvbnJwYyByZXF1ZXQgb2JqZWN0XG4gKi9cbkJhdGNoLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgIHRoaXMucmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBleGVjdXRlIGJhdGNoIHJlcXVlc3RcbiAqXG4gKiBAbWV0aG9kIGV4ZWN1dGVcbiAqL1xuQmF0Y2gucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlcXVlc3RzID0gdGhpcy5yZXF1ZXN0cztcbiAgICBSZXF1ZXN0TWFuYWdlci5nZXRJbnN0YW5jZSgpLnNlbmRCYXRjaChyZXF1ZXN0cywgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgICByZXN1bHRzID0gcmVzdWx0cyB8fCBbXTtcbiAgICAgICAgcmVxdWVzdHMubWFwKGZ1bmN0aW9uIChyZXF1ZXN0LCBpbmRleCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHNbaW5kZXhdIHx8IHt9O1xuICAgICAgICB9KS5tYXAoZnVuY3Rpb24gKHJlc3VsdCwgaW5kZXgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0c1tpbmRleF0uZm9ybWF0ID8gcmVxdWVzdHNbaW5kZXhdLmZvcm1hdChyZXN1bHQucmVzdWx0KSA6IHJlc3VsdC5yZXN1bHQ7XG4gICAgICAgIH0pLmZvckVhY2goZnVuY3Rpb24gKHJlc3VsdCwgaW5kZXgpIHtcbiAgICAgICAgICAgIGlmIChyZXF1ZXN0c1tpbmRleF0uY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXF1ZXN0c1tpbmRleF0uY2FsbGJhY2soZXJyLCByZXN1bHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTsgXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhdGNoO1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIGNvbnRyYWN0LmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNFxuICovXG5cbnZhciB3ZWIzID0gcmVxdWlyZSgnLi4vd2ViMycpOyBcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgY29kZXIgPSByZXF1aXJlKCcuLi9zb2xpZGl0eS9jb2RlcicpO1xudmFyIFNvbGlkaXR5RXZlbnQgPSByZXF1aXJlKCcuL2V2ZW50Jyk7XG52YXIgU29saWRpdHlGdW5jdGlvbiA9IHJlcXVpcmUoJy4vZnVuY3Rpb24nKTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGVuY29kZSBjb25zdHJ1Y3RvciBwYXJhbXNcbiAqXG4gKiBAbWV0aG9kIGVuY29kZUNvbnN0cnVjdG9yUGFyYW1zXG4gKiBAcGFyYW0ge0FycmF5fSBhYmlcbiAqIEBwYXJhbSB7QXJyYXl9IGNvbnN0cnVjdG9yIHBhcmFtc1xuICovXG52YXIgZW5jb2RlQ29uc3RydWN0b3JQYXJhbXMgPSBmdW5jdGlvbiAoYWJpLCBwYXJhbXMpIHtcbiAgICByZXR1cm4gYWJpLmZpbHRlcihmdW5jdGlvbiAoanNvbikge1xuICAgICAgICByZXR1cm4ganNvbi50eXBlID09PSAnY29uc3RydWN0b3InICYmIGpzb24uaW5wdXRzLmxlbmd0aCA9PT0gcGFyYW1zLmxlbmd0aDtcbiAgICB9KS5tYXAoZnVuY3Rpb24gKGpzb24pIHtcbiAgICAgICAgcmV0dXJuIGpzb24uaW5wdXRzLm1hcChmdW5jdGlvbiAoaW5wdXQpIHtcbiAgICAgICAgICAgIHJldHVybiBpbnB1dC50eXBlO1xuICAgICAgICB9KTtcbiAgICB9KS5tYXAoZnVuY3Rpb24gKHR5cGVzKSB7XG4gICAgICAgIHJldHVybiBjb2Rlci5lbmNvZGVQYXJhbXModHlwZXMsIHBhcmFtcyk7XG4gICAgfSlbMF0gfHwgJyc7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gYWRkIGZ1bmN0aW9ucyB0byBjb250cmFjdCBvYmplY3RcbiAqXG4gKiBAbWV0aG9kIGFkZEZ1bmN0aW9uc1RvQ29udHJhY3RcbiAqIEBwYXJhbSB7Q29udHJhY3R9IGNvbnRyYWN0XG4gKiBAcGFyYW0ge0FycmF5fSBhYmlcbiAqL1xudmFyIGFkZEZ1bmN0aW9uc1RvQ29udHJhY3QgPSBmdW5jdGlvbiAoY29udHJhY3QsIGFiaSkge1xuICAgIGFiaS5maWx0ZXIoZnVuY3Rpb24gKGpzb24pIHtcbiAgICAgICAgcmV0dXJuIGpzb24udHlwZSA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9KS5tYXAoZnVuY3Rpb24gKGpzb24pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTb2xpZGl0eUZ1bmN0aW9uKGpzb24sIGNvbnRyYWN0LmFkZHJlc3MpO1xuICAgIH0pLmZvckVhY2goZnVuY3Rpb24gKGYpIHtcbiAgICAgICAgZi5hdHRhY2hUb0NvbnRyYWN0KGNvbnRyYWN0KTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBhZGQgZXZlbnRzIHRvIGNvbnRyYWN0IG9iamVjdFxuICpcbiAqIEBtZXRob2QgYWRkRXZlbnRzVG9Db250cmFjdFxuICogQHBhcmFtIHtDb250cmFjdH0gY29udHJhY3RcbiAqIEBwYXJhbSB7QXJyYXl9IGFiaVxuICovXG52YXIgYWRkRXZlbnRzVG9Db250cmFjdCA9IGZ1bmN0aW9uIChjb250cmFjdCwgYWJpKSB7XG4gICAgYWJpLmZpbHRlcihmdW5jdGlvbiAoanNvbikge1xuICAgICAgICByZXR1cm4ganNvbi50eXBlID09PSAnZXZlbnQnO1xuICAgIH0pLm1hcChmdW5jdGlvbiAoanNvbikge1xuICAgICAgICByZXR1cm4gbmV3IFNvbGlkaXR5RXZlbnQoanNvbiwgY29udHJhY3QuYWRkcmVzcyk7XG4gICAgfSkuZm9yRWFjaChmdW5jdGlvbiAoZSkge1xuICAgICAgICBlLmF0dGFjaFRvQ29udHJhY3QoY29udHJhY3QpO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNyZWF0ZSBuZXcgQ29udHJhY3RGYWN0b3J5XG4gKlxuICogQG1ldGhvZCBjb250cmFjdFxuICogQHBhcmFtIHtBcnJheX0gYWJpXG4gKiBAcmV0dXJucyB7Q29udHJhY3RGYWN0b3J5fSBuZXcgY29udHJhY3QgZmFjdG9yeVxuICovXG52YXIgY29udHJhY3QgPSBmdW5jdGlvbiAoYWJpKSB7XG4gICAgcmV0dXJuIG5ldyBDb250cmFjdEZhY3RvcnkoYWJpKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBjcmVhdGUgbmV3IENvbnRyYWN0RmFjdG9yeSBpbnN0YW5jZVxuICpcbiAqIEBtZXRob2QgQ29udHJhY3RGYWN0b3J5XG4gKiBAcGFyYW0ge0FycmF5fSBhYmlcbiAqL1xudmFyIENvbnRyYWN0RmFjdG9yeSA9IGZ1bmN0aW9uIChhYmkpIHtcbiAgICB0aGlzLmFiaSA9IGFiaTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBjcmVhdGUgbmV3IGNvbnRyYWN0IG9uIGEgYmxvY2tjaGFpblxuICogXG4gKiBAbWV0aG9kIG5ld1xuICogQHBhcmFtIHtBbnl9IGNvbnRyYWN0IGNvbnN0cnVjdG9yIHBhcmFtMSAob3B0aW9uYWwpXG4gKiBAcGFyYW0ge0FueX0gY29udHJhY3QgY29uc3RydWN0b3IgcGFyYW0yIChvcHRpb25hbClcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb250cmFjdCB0cmFuc2FjdGlvbiBvYmplY3QgKHJlcXVpcmVkKVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAqIEByZXR1cm5zIHtDb250cmFjdH0gcmV0dXJucyBjb250cmFjdCBpZiBubyBjYWxsYmFjayB3YXMgcGFzc2VkLFxuICogb3RoZXJ3aXNlIGNhbGxzIGNhbGxiYWNrIGZ1bmN0aW9uIChlcnIsIGNvbnRyYWN0KVxuICovXG5Db250cmFjdEZhY3RvcnkucHJvdG90eXBlLm5ldyA9IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBwYXJzZSBhcmd1bWVudHNcbiAgICB2YXIgb3B0aW9ucyA9IHt9OyAvLyByZXF1aXJlZCFcbiAgICB2YXIgY2FsbGJhY2s7XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgaWYgKHV0aWxzLmlzRnVuY3Rpb24oYXJnc1thcmdzLmxlbmd0aCAtIDFdKSkge1xuICAgICAgICBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgfVxuXG4gICAgdmFyIGxhc3QgPSBhcmdzW2FyZ3MubGVuZ3RoIC0gMV07XG4gICAgaWYgKHV0aWxzLmlzT2JqZWN0KGxhc3QpICYmICF1dGlscy5pc0FycmF5KGxhc3QpKSB7XG4gICAgICAgIG9wdGlvbnMgPSBhcmdzLnBvcCgpO1xuICAgIH1cblxuICAgIC8vIHRocm93IGFuIGVycm9yIGlmIHRoZXJlIGFyZSBubyBvcHRpb25zXG5cbiAgICB2YXIgYnl0ZXMgPSBlbmNvZGVDb25zdHJ1Y3RvclBhcmFtcyh0aGlzLmFiaSwgYXJncyk7XG4gICAgb3B0aW9ucy5kYXRhICs9IGJ5dGVzO1xuXG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICB2YXIgYWRkcmVzcyA9IHdlYjMuZXRoLnNlbmRUcmFuc2FjdGlvbihvcHRpb25zKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXQoYWRkcmVzcyk7XG4gICAgfVxuICBcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgd2ViMy5ldGguc2VuZFRyYW5zYWN0aW9uKG9wdGlvbnMsIGZ1bmN0aW9uIChlcnIsIGFkZHJlc3MpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBzZWxmLmF0KGFkZHJlc3MsIGNhbGxiYWNrKTsgXG4gICAgfSk7IFxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGdldCBhY2Nlc3MgdG8gZXhpc3RpbmcgY29udHJhY3Qgb24gYSBibG9ja2NoYWluXG4gKlxuICogQG1ldGhvZCBhdFxuICogQHBhcmFtIHtBZGRyZXNzfSBjb250cmFjdCBhZGRyZXNzIChyZXF1aXJlZClcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHtvcHRpb25hbClcbiAqIEByZXR1cm5zIHtDb250cmFjdH0gcmV0dXJucyBjb250cmFjdCBpZiBubyBjYWxsYmFjayB3YXMgcGFzc2VkLFxuICogb3RoZXJ3aXNlIGNhbGxzIGNhbGxiYWNrIGZ1bmN0aW9uIChlcnIsIGNvbnRyYWN0KVxuICovXG5Db250cmFjdEZhY3RvcnkucHJvdG90eXBlLmF0ID0gZnVuY3Rpb24gKGFkZHJlc3MsIGNhbGxiYWNrKSB7XG4gICAgLy8gVE9ETzogYWRkcmVzcyBpcyByZXF1aXJlZFxuICAgIFxuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayhudWxsLCBuZXcgQ29udHJhY3QodGhpcy5hYmksIGFkZHJlc3MpKTtcbiAgICB9IFxuICAgIHJldHVybiBuZXcgQ29udHJhY3QodGhpcy5hYmksIGFkZHJlc3MpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNyZWF0ZSBuZXcgY29udHJhY3QgaW5zdGFuY2VcbiAqXG4gKiBAbWV0aG9kIENvbnRyYWN0XG4gKiBAcGFyYW0ge0FycmF5fSBhYmlcbiAqIEBwYXJhbSB7QWRkcmVzc30gY29udHJhY3QgYWRkcmVzc1xuICovXG52YXIgQ29udHJhY3QgPSBmdW5jdGlvbiAoYWJpLCBhZGRyZXNzKSB7XG4gICAgdGhpcy5hZGRyZXNzID0gYWRkcmVzcztcbiAgICBhZGRGdW5jdGlvbnNUb0NvbnRyYWN0KHRoaXMsIGFiaSk7XG4gICAgYWRkRXZlbnRzVG9Db250cmFjdCh0aGlzLCBhYmkpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBjb250cmFjdDtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUgZGIuanNcbiAqIEBhdXRob3JzOlxuICogICBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgTWV0aG9kID0gcmVxdWlyZSgnLi9tZXRob2QnKTtcblxudmFyIHB1dFN0cmluZyA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdwdXRTdHJpbmcnLFxuICAgIGNhbGw6ICdkYl9wdXRTdHJpbmcnLFxuICAgIHBhcmFtczogM1xufSk7XG5cblxudmFyIGdldFN0cmluZyA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRTdHJpbmcnLFxuICAgIGNhbGw6ICdkYl9nZXRTdHJpbmcnLFxuICAgIHBhcmFtczogMlxufSk7XG5cbnZhciBwdXRIZXggPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAncHV0SGV4JyxcbiAgICBjYWxsOiAnZGJfcHV0SGV4JyxcbiAgICBwYXJhbXM6IDNcbn0pO1xuXG52YXIgZ2V0SGV4ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldEhleCcsXG4gICAgY2FsbDogJ2RiX2dldEhleCcsXG4gICAgcGFyYW1zOiAyXG59KTtcblxudmFyIG1ldGhvZHMgPSBbXG4gICAgcHV0U3RyaW5nLCBnZXRTdHJpbmcsIHB1dEhleCwgZ2V0SGV4XG5dO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBtZXRob2RzOiBtZXRob2RzXG59O1xuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogXG4gKiBAZmlsZSBlcnJvcnMuanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE1XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgSW52YWxpZE51bWJlck9mUGFyYW1zOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBuZXcgRXJyb3IoJ0ludmFsaWQgbnVtYmVyIG9mIGlucHV0IHBhcmFtZXRlcnMnKTtcbiAgICB9LFxuICAgIEludmFsaWRDb25uZWN0aW9uOiBmdW5jdGlvbiAoaG9zdCl7XG4gICAgICAgIHJldHVybiBuZXcgRXJyb3IoJ0NPTk5FQ1RJT04gRVJST1I6IENvdWxkblxcJ3QgY29ubmVjdCB0byBub2RlICcrIGhvc3QgKycsIGlzIGl0IHJ1bm5pbmc/Jyk7XG4gICAgfSxcbiAgICBJbnZhbGlkUHJvdmlkZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBFcnJvcignUHJvdmlkb3Igbm90IHNldCBvciBpbnZhbGlkJyk7XG4gICAgfSxcbiAgICBJbnZhbGlkUmVzcG9uc2U6IGZ1bmN0aW9uIChyZXN1bHQpe1xuICAgICAgICB2YXIgbWVzc2FnZSA9ICEhcmVzdWx0ICYmICEhcmVzdWx0LmVycm9yICYmICEhcmVzdWx0LmVycm9yLm1lc3NhZ2UgPyByZXN1bHQuZXJyb3IubWVzc2FnZSA6ICdJbnZhbGlkIEpTT04gUlBDIHJlc3BvbnNlJztcbiAgICAgICAgcmV0dXJuIG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICB9XG59O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKlxuICogQGZpbGUgZXRoLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGF1dGhvciBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG4vKipcbiAqIFdlYjNcbiAqXG4gKiBAbW9kdWxlIHdlYjNcbiAqL1xuXG4vKipcbiAqIEV0aCBtZXRob2RzIGFuZCBwcm9wZXJ0aWVzXG4gKlxuICogQW4gZXhhbXBsZSBtZXRob2Qgb2JqZWN0IGNhbiBsb29rIGFzIGZvbGxvd3M6XG4gKlxuICogICAgICB7XG4gKiAgICAgIG5hbWU6ICdnZXRCbG9jaycsXG4gKiAgICAgIGNhbGw6IGJsb2NrQ2FsbCxcbiAqICAgICAgcGFyYW1zOiAyLFxuICogICAgICBvdXRwdXRGb3JtYXR0ZXI6IGZvcm1hdHRlcnMub3V0cHV0QmxvY2tGb3JtYXR0ZXIsXG4gKiAgICAgIGlucHV0Rm9ybWF0dGVyOiBbIC8vIGNhbiBiZSBhIGZvcm1hdHRlciBmdW5jaXRvbiBvciBhbiBhcnJheSBvZiBmdW5jdGlvbnMuIFdoZXJlIGVhY2ggaXRlbSBpbiB0aGUgYXJyYXkgd2lsbCBiZSB1c2VkIGZvciBvbmUgcGFyYW1ldGVyXG4gKiAgICAgICAgICAgdXRpbHMudG9IZXgsIC8vIGZvcm1hdHMgcGFyYW10ZXIgMVxuICogICAgICAgICAgIGZ1bmN0aW9uKHBhcmFtKXsgcmV0dXJuICEhcGFyYW07IH0gLy8gZm9ybWF0cyBwYXJhbXRlciAyXG4gKiAgICAgICAgIF1cbiAqICAgICAgIH0sXG4gKlxuICogQGNsYXNzIFt3ZWIzXSBldGhcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgZm9ybWF0dGVycyA9IHJlcXVpcmUoJy4vZm9ybWF0dGVycycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBNZXRob2QgPSByZXF1aXJlKCcuL21ldGhvZCcpO1xudmFyIFByb3BlcnR5ID0gcmVxdWlyZSgnLi9wcm9wZXJ0eScpO1xuXG52YXIgYmxvY2tDYWxsID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICByZXR1cm4gKHV0aWxzLmlzU3RyaW5nKGFyZ3NbMF0pICYmIGFyZ3NbMF0uaW5kZXhPZignMHgnKSA9PT0gMCkgPyBcImV0aF9nZXRCbG9ja0J5SGFzaFwiIDogXCJldGhfZ2V0QmxvY2tCeU51bWJlclwiO1xufTtcblxudmFyIHRyYW5zYWN0aW9uRnJvbUJsb2NrQ2FsbCA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgcmV0dXJuICh1dGlscy5pc1N0cmluZyhhcmdzWzBdKSAmJiBhcmdzWzBdLmluZGV4T2YoJzB4JykgPT09IDApID8gJ2V0aF9nZXRUcmFuc2FjdGlvbkJ5QmxvY2tIYXNoQW5kSW5kZXgnIDogJ2V0aF9nZXRUcmFuc2FjdGlvbkJ5QmxvY2tOdW1iZXJBbmRJbmRleCc7XG59O1xuXG52YXIgdW5jbGVDYWxsID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICByZXR1cm4gKHV0aWxzLmlzU3RyaW5nKGFyZ3NbMF0pICYmIGFyZ3NbMF0uaW5kZXhPZignMHgnKSA9PT0gMCkgPyAnZXRoX2dldFVuY2xlQnlCbG9ja0hhc2hBbmRJbmRleCcgOiAnZXRoX2dldFVuY2xlQnlCbG9ja051bWJlckFuZEluZGV4Jztcbn07XG5cbnZhciBnZXRCbG9ja1RyYW5zYWN0aW9uQ291bnRDYWxsID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICByZXR1cm4gKHV0aWxzLmlzU3RyaW5nKGFyZ3NbMF0pICYmIGFyZ3NbMF0uaW5kZXhPZignMHgnKSA9PT0gMCkgPyAnZXRoX2dldEJsb2NrVHJhbnNhY3Rpb25Db3VudEJ5SGFzaCcgOiAnZXRoX2dldEJsb2NrVHJhbnNhY3Rpb25Db3VudEJ5TnVtYmVyJztcbn07XG5cbnZhciB1bmNsZUNvdW50Q2FsbCA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgcmV0dXJuICh1dGlscy5pc1N0cmluZyhhcmdzWzBdKSAmJiBhcmdzWzBdLmluZGV4T2YoJzB4JykgPT09IDApID8gJ2V0aF9nZXRVbmNsZUNvdW50QnlCbG9ja0hhc2gnIDogJ2V0aF9nZXRVbmNsZUNvdW50QnlCbG9ja051bWJlcic7XG59O1xuXG4vLy8gQHJldHVybnMgYW4gYXJyYXkgb2Ygb2JqZWN0cyBkZXNjcmliaW5nIHdlYjMuZXRoIGFwaSBtZXRob2RzXG5cbnZhciBnZXRCYWxhbmNlID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldEJhbGFuY2UnLFxuICAgIGNhbGw6ICdldGhfZ2V0QmFsYW5jZScsXG4gICAgcGFyYW1zOiAyLFxuICAgIGlucHV0Rm9ybWF0dGVyOiBbdXRpbHMudG9BZGRyZXNzLCBmb3JtYXR0ZXJzLmlucHV0RGVmYXVsdEJsb2NrTnVtYmVyRm9ybWF0dGVyXSxcbiAgICBvdXRwdXRGb3JtYXR0ZXI6IGZvcm1hdHRlcnMub3V0cHV0QmlnTnVtYmVyRm9ybWF0dGVyXG59KTtcblxudmFyIGdldFN0b3JhZ2VBdCA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRTdG9yYWdlQXQnLFxuICAgIGNhbGw6ICdldGhfZ2V0U3RvcmFnZUF0JyxcbiAgICBwYXJhbXM6IDMsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtudWxsLCB1dGlscy50b0hleCwgZm9ybWF0dGVycy5pbnB1dERlZmF1bHRCbG9ja051bWJlckZvcm1hdHRlcl1cbn0pO1xuXG52YXIgZ2V0Q29kZSA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRDb2RlJyxcbiAgICBjYWxsOiAnZXRoX2dldENvZGUnLFxuICAgIHBhcmFtczogMixcbiAgICBpbnB1dEZvcm1hdHRlcjogW3V0aWxzLnRvQWRkcmVzcywgZm9ybWF0dGVycy5pbnB1dERlZmF1bHRCbG9ja051bWJlckZvcm1hdHRlcl1cbn0pO1xuXG52YXIgZ2V0QmxvY2sgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0QmxvY2snLFxuICAgIGNhbGw6IGJsb2NrQ2FsbCxcbiAgICBwYXJhbXM6IDIsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0QmxvY2tOdW1iZXJGb3JtYXR0ZXIsIGZ1bmN0aW9uICh2YWwpIHsgcmV0dXJuICEhdmFsOyB9XSxcbiAgICBvdXRwdXRGb3JtYXR0ZXI6IGZvcm1hdHRlcnMub3V0cHV0QmxvY2tGb3JtYXR0ZXJcbn0pO1xuXG52YXIgZ2V0VW5jbGUgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0VW5jbGUnLFxuICAgIGNhbGw6IHVuY2xlQ2FsbCxcbiAgICBwYXJhbXM6IDIsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0QmxvY2tOdW1iZXJGb3JtYXR0ZXIsIHV0aWxzLnRvSGV4XSxcbiAgICBvdXRwdXRGb3JtYXR0ZXI6IGZvcm1hdHRlcnMub3V0cHV0QmxvY2tGb3JtYXR0ZXIsXG5cbn0pO1xuXG52YXIgZ2V0Q29tcGlsZXJzID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldENvbXBpbGVycycsXG4gICAgY2FsbDogJ2V0aF9nZXRDb21waWxlcnMnLFxuICAgIHBhcmFtczogMFxufSk7XG5cbnZhciBnZXRCbG9ja1RyYW5zYWN0aW9uQ291bnQgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0QmxvY2tUcmFuc2FjdGlvbkNvdW50JyxcbiAgICBjYWxsOiBnZXRCbG9ja1RyYW5zYWN0aW9uQ291bnRDYWxsLFxuICAgIHBhcmFtczogMSxcbiAgICBpbnB1dEZvcm1hdHRlcjogW2Zvcm1hdHRlcnMuaW5wdXRCbG9ja051bWJlckZvcm1hdHRlcl0sXG4gICAgb3V0cHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbn0pO1xuXG52YXIgZ2V0QmxvY2tVbmNsZUNvdW50ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldEJsb2NrVW5jbGVDb3VudCcsXG4gICAgY2FsbDogdW5jbGVDb3VudENhbGwsXG4gICAgcGFyYW1zOiAxLFxuICAgIGlucHV0Rm9ybWF0dGVyOiBbZm9ybWF0dGVycy5pbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyXSxcbiAgICBvdXRwdXRGb3JtYXR0ZXI6IHV0aWxzLnRvRGVjaW1hbFxufSk7XG5cbnZhciBnZXRUcmFuc2FjdGlvbiA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRUcmFuc2FjdGlvbicsXG4gICAgY2FsbDogJ2V0aF9nZXRUcmFuc2FjdGlvbkJ5SGFzaCcsXG4gICAgcGFyYW1zOiAxLFxuICAgIG91dHB1dEZvcm1hdHRlcjogZm9ybWF0dGVycy5vdXRwdXRUcmFuc2FjdGlvbkZvcm1hdHRlclxufSk7XG5cbnZhciBnZXRUcmFuc2FjdGlvbkZyb21CbG9jayA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRUcmFuc2FjdGlvbkZyb21CbG9jaycsXG4gICAgY2FsbDogdHJhbnNhY3Rpb25Gcm9tQmxvY2tDYWxsLFxuICAgIHBhcmFtczogMixcbiAgICBpbnB1dEZvcm1hdHRlcjogW2Zvcm1hdHRlcnMuaW5wdXRCbG9ja051bWJlckZvcm1hdHRlciwgdXRpbHMudG9IZXhdLFxuICAgIG91dHB1dEZvcm1hdHRlcjogZm9ybWF0dGVycy5vdXRwdXRUcmFuc2FjdGlvbkZvcm1hdHRlclxufSk7XG5cbnZhciBnZXRUcmFuc2FjdGlvbkNvdW50ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldFRyYW5zYWN0aW9uQ291bnQnLFxuICAgIGNhbGw6ICdldGhfZ2V0VHJhbnNhY3Rpb25Db3VudCcsXG4gICAgcGFyYW1zOiAyLFxuICAgIGlucHV0Rm9ybWF0dGVyOiBbbnVsbCwgZm9ybWF0dGVycy5pbnB1dERlZmF1bHRCbG9ja051bWJlckZvcm1hdHRlcl0sXG4gICAgb3V0cHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbn0pO1xuXG52YXIgc2VuZFRyYW5zYWN0aW9uID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ3NlbmRUcmFuc2FjdGlvbicsXG4gICAgY2FsbDogJ2V0aF9zZW5kVHJhbnNhY3Rpb24nLFxuICAgIHBhcmFtczogMSxcbiAgICBpbnB1dEZvcm1hdHRlcjogW2Zvcm1hdHRlcnMuaW5wdXRUcmFuc2FjdGlvbkZvcm1hdHRlcl1cbn0pO1xuXG52YXIgY2FsbCA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdjYWxsJyxcbiAgICBjYWxsOiAnZXRoX2NhbGwnLFxuICAgIHBhcmFtczogMixcbiAgICBpbnB1dEZvcm1hdHRlcjogW2Zvcm1hdHRlcnMuaW5wdXRUcmFuc2FjdGlvbkZvcm1hdHRlciwgZm9ybWF0dGVycy5pbnB1dERlZmF1bHRCbG9ja051bWJlckZvcm1hdHRlcl1cbn0pO1xuXG52YXIgZXN0aW1hdGVHYXMgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZXN0aW1hdGVHYXMnLFxuICAgIGNhbGw6ICdldGhfZXN0aW1hdGVHYXMnLFxuICAgIHBhcmFtczogMSxcbiAgICBpbnB1dEZvcm1hdHRlcjogW2Zvcm1hdHRlcnMuaW5wdXRUcmFuc2FjdGlvbkZvcm1hdHRlcl0sXG4gICAgb3V0cHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbn0pO1xuXG52YXIgY29tcGlsZVNvbGlkaXR5ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2NvbXBpbGUuc29saWRpdHknLFxuICAgIGNhbGw6ICdldGhfY29tcGlsZVNvbGlkaXR5JyxcbiAgICBwYXJhbXM6IDFcbn0pO1xuXG52YXIgY29tcGlsZUxMTCA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdjb21waWxlLmxsbCcsXG4gICAgY2FsbDogJ2V0aF9jb21waWxlTExMJyxcbiAgICBwYXJhbXM6IDFcbn0pO1xuXG52YXIgY29tcGlsZVNlcnBlbnQgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnY29tcGlsZS5zZXJwZW50JyxcbiAgICBjYWxsOiAnZXRoX2NvbXBpbGVTZXJwZW50JyxcbiAgICBwYXJhbXM6IDFcbn0pO1xuXG52YXIgc3VibWl0V29yayA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdzdWJtaXRXb3JrJyxcbiAgICBjYWxsOiAnZXRoX3N1Ym1pdFdvcmsnLFxuICAgIHBhcmFtczogM1xufSk7XG5cbnZhciBnZXRXb3JrID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldFdvcmsnLFxuICAgIGNhbGw6ICdldGhfZ2V0V29yaycsXG4gICAgcGFyYW1zOiAwXG59KTtcblxudmFyIG1ldGhvZHMgPSBbXG4gICAgZ2V0QmFsYW5jZSxcbiAgICBnZXRTdG9yYWdlQXQsXG4gICAgZ2V0Q29kZSxcbiAgICBnZXRCbG9jayxcbiAgICBnZXRVbmNsZSxcbiAgICBnZXRDb21waWxlcnMsXG4gICAgZ2V0QmxvY2tUcmFuc2FjdGlvbkNvdW50LFxuICAgIGdldEJsb2NrVW5jbGVDb3VudCxcbiAgICBnZXRUcmFuc2FjdGlvbixcbiAgICBnZXRUcmFuc2FjdGlvbkZyb21CbG9jayxcbiAgICBnZXRUcmFuc2FjdGlvbkNvdW50LFxuICAgIGNhbGwsXG4gICAgZXN0aW1hdGVHYXMsXG4gICAgc2VuZFRyYW5zYWN0aW9uLFxuICAgIGNvbXBpbGVTb2xpZGl0eSxcbiAgICBjb21waWxlTExMLFxuICAgIGNvbXBpbGVTZXJwZW50LFxuICAgIHN1Ym1pdFdvcmssXG4gICAgZ2V0V29ya1xuXTtcblxuLy8vIEByZXR1cm5zIGFuIGFycmF5IG9mIG9iamVjdHMgZGVzY3JpYmluZyB3ZWIzLmV0aCBhcGkgcHJvcGVydGllc1xuXG5cblxudmFyIHByb3BlcnRpZXMgPSBbXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ2NvaW5iYXNlJyxcbiAgICAgICAgZ2V0dGVyOiAnZXRoX2NvaW5iYXNlJ1xuICAgIH0pLFxuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICdtaW5pbmcnLFxuICAgICAgICBnZXR0ZXI6ICdldGhfbWluaW5nJ1xuICAgIH0pLFxuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICdoYXNocmF0ZScsXG4gICAgICAgIGdldHRlcjogJ2V0aF9oYXNocmF0ZScsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogdXRpbHMudG9EZWNpbWFsXG4gICAgfSksXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ2dhc1ByaWNlJyxcbiAgICAgICAgZ2V0dGVyOiAnZXRoX2dhc1ByaWNlJyxcbiAgICAgICAgb3V0cHV0Rm9ybWF0dGVyOiBmb3JtYXR0ZXJzLm91dHB1dEJpZ051bWJlckZvcm1hdHRlclxuICAgIH0pLFxuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICdhY2NvdW50cycsXG4gICAgICAgIGdldHRlcjogJ2V0aF9hY2NvdW50cydcbiAgICB9KSxcbiAgICBuZXcgUHJvcGVydHkoe1xuICAgICAgICBuYW1lOiAnYmxvY2tOdW1iZXInLFxuICAgICAgICBnZXR0ZXI6ICdldGhfYmxvY2tOdW1iZXInLFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IHV0aWxzLnRvRGVjaW1hbFxuICAgIH0pXG5dO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBtZXRob2RzOiBtZXRob2RzLFxuICAgIHByb3BlcnRpZXM6IHByb3BlcnRpZXNcbn07XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIFxuICogQGZpbGUgZXZlbnQuanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE0XG4gKi9cblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBjb2RlciA9IHJlcXVpcmUoJy4uL3NvbGlkaXR5L2NvZGVyJyk7XG52YXIgd2ViMyA9IHJlcXVpcmUoJy4uL3dlYjMnKTtcbnZhciBmb3JtYXR0ZXJzID0gcmVxdWlyZSgnLi9mb3JtYXR0ZXJzJyk7XG5cbi8qKlxuICogVGhpcyBwcm90b3R5cGUgc2hvdWxkIGJlIHVzZWQgdG8gY3JlYXRlIGV2ZW50IGZpbHRlcnNcbiAqL1xudmFyIFNvbGlkaXR5RXZlbnQgPSBmdW5jdGlvbiAoanNvbiwgYWRkcmVzcykge1xuICAgIHRoaXMuX3BhcmFtcyA9IGpzb24uaW5wdXRzO1xuICAgIHRoaXMuX25hbWUgPSB1dGlscy50cmFuc2Zvcm1Ub0Z1bGxOYW1lKGpzb24pO1xuICAgIHRoaXMuX2FkZHJlc3MgPSBhZGRyZXNzO1xuICAgIHRoaXMuX2Fub255bW91cyA9IGpzb24uYW5vbnltb3VzO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgZmlsdGVyZWQgcGFyYW0gdHlwZXNcbiAqXG4gKiBAbWV0aG9kIHR5cGVzXG4gKiBAcGFyYW0ge0Jvb2x9IGRlY2lkZSBpZiByZXR1cm5lZCB0eXBlZCBzaG91bGQgYmUgaW5kZXhlZFxuICogQHJldHVybiB7QXJyYXl9IGFycmF5IG9mIHR5cGVzXG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLnR5cGVzID0gZnVuY3Rpb24gKGluZGV4ZWQpIHtcbiAgICByZXR1cm4gdGhpcy5fcGFyYW1zLmZpbHRlcihmdW5jdGlvbiAoaSkge1xuICAgICAgICByZXR1cm4gaS5pbmRleGVkID09PSBpbmRleGVkO1xuICAgIH0pLm1hcChmdW5jdGlvbiAoaSkge1xuICAgICAgICByZXR1cm4gaS50eXBlO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgZXZlbnQgZGlzcGxheSBuYW1lXG4gKlxuICogQG1ldGhvZCBkaXNwbGF5TmFtZVxuICogQHJldHVybiB7U3RyaW5nfSBldmVudCBkaXNwbGF5IG5hbWVcbiAqL1xuU29saWRpdHlFdmVudC5wcm90b3R5cGUuZGlzcGxheU5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHV0aWxzLmV4dHJhY3REaXNwbGF5TmFtZSh0aGlzLl9uYW1lKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZ2V0IGV2ZW50IHR5cGUgbmFtZVxuICpcbiAqIEBtZXRob2QgdHlwZU5hbWVcbiAqIEByZXR1cm4ge1N0cmluZ30gZXZlbnQgdHlwZSBuYW1lXG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLnR5cGVOYW1lID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB1dGlscy5leHRyYWN0VHlwZU5hbWUodGhpcy5fbmFtZSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGdldCBldmVudCBzaWduYXR1cmVcbiAqXG4gKiBAbWV0aG9kIHNpZ25hdHVyZVxuICogQHJldHVybiB7U3RyaW5nfSBldmVudCBzaWduYXR1cmVcbiAqL1xuU29saWRpdHlFdmVudC5wcm90b3R5cGUuc2lnbmF0dXJlID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB3ZWIzLnNoYTMod2ViMy5mcm9tQXNjaWkodGhpcy5fbmFtZSkpLnNsaWNlKDIpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBlbmNvZGUgaW5kZXhlZCBwYXJhbXMgYW5kIG9wdGlvbnMgdG8gb25lIGZpbmFsIG9iamVjdFxuICogXG4gKiBAbWV0aG9kIGVuY29kZVxuICogQHBhcmFtIHtPYmplY3R9IGluZGV4ZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtPYmplY3R9IGV2ZXJ5dGhpbmcgY29tYmluZWQgdG9nZXRoZXIgYW5kIGVuY29kZWRcbiAqL1xuU29saWRpdHlFdmVudC5wcm90b3R5cGUuZW5jb2RlID0gZnVuY3Rpb24gKGluZGV4ZWQsIG9wdGlvbnMpIHtcbiAgICBpbmRleGVkID0gaW5kZXhlZCB8fCB7fTtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgcmVzdWx0ID0ge307XG5cbiAgICBbJ2Zyb21CbG9jaycsICd0b0Jsb2NrJ10uZmlsdGVyKGZ1bmN0aW9uIChmKSB7XG4gICAgICAgIHJldHVybiBvcHRpb25zW2ZdICE9PSB1bmRlZmluZWQ7XG4gICAgfSkuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICByZXN1bHRbZl0gPSBmb3JtYXR0ZXJzLmlucHV0QmxvY2tOdW1iZXJGb3JtYXR0ZXIob3B0aW9uc1tmXSk7XG4gICAgfSk7XG5cbiAgICByZXN1bHQudG9waWNzID0gW107XG5cbiAgICBpZiAoIXRoaXMuX2Fub255bW91cykge1xuICAgICAgICByZXN1bHQuYWRkcmVzcyA9IHRoaXMuX2FkZHJlc3M7XG4gICAgICAgIHJlc3VsdC50b3BpY3MucHVzaCgnMHgnICsgdGhpcy5zaWduYXR1cmUoKSk7XG4gICAgfVxuXG4gICAgdmFyIGluZGV4ZWRUb3BpY3MgPSB0aGlzLl9wYXJhbXMuZmlsdGVyKGZ1bmN0aW9uIChpKSB7XG4gICAgICAgIHJldHVybiBpLmluZGV4ZWQgPT09IHRydWU7XG4gICAgfSkubWFwKGZ1bmN0aW9uIChpKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGluZGV4ZWRbaS5uYW1lXTtcbiAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAodXRpbHMuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJzB4JyArIGNvZGVyLmVuY29kZVBhcmFtKGkudHlwZSwgdik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJzB4JyArIGNvZGVyLmVuY29kZVBhcmFtKGkudHlwZSwgdmFsdWUpO1xuICAgIH0pO1xuXG4gICAgcmVzdWx0LnRvcGljcyA9IHJlc3VsdC50b3BpY3MuY29uY2F0KGluZGV4ZWRUb3BpY3MpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZGVjb2RlIGluZGV4ZWQgcGFyYW1zIGFuZCBvcHRpb25zXG4gKlxuICogQG1ldGhvZCBkZWNvZGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhXG4gKiBAcmV0dXJuIHtPYmplY3R9IHJlc3VsdCBvYmplY3Qgd2l0aCBkZWNvZGVkIGluZGV4ZWQgJiYgbm90IGluZGV4ZWQgcGFyYW1zXG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLmRlY29kZSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gXG4gICAgZGF0YS5kYXRhID0gZGF0YS5kYXRhIHx8ICcnO1xuICAgIGRhdGEudG9waWNzID0gZGF0YS50b3BpY3MgfHwgW107XG5cbiAgICB2YXIgYXJnVG9waWNzID0gdGhpcy5fYW5vbnltb3VzID8gZGF0YS50b3BpY3MgOiBkYXRhLnRvcGljcy5zbGljZSgxKTtcbiAgICB2YXIgaW5kZXhlZERhdGEgPSBhcmdUb3BpY3MubWFwKGZ1bmN0aW9uICh0b3BpY3MpIHsgcmV0dXJuIHRvcGljcy5zbGljZSgyKTsgfSkuam9pbihcIlwiKTtcbiAgICB2YXIgaW5kZXhlZFBhcmFtcyA9IGNvZGVyLmRlY29kZVBhcmFtcyh0aGlzLnR5cGVzKHRydWUpLCBpbmRleGVkRGF0YSk7IFxuXG4gICAgdmFyIG5vdEluZGV4ZWREYXRhID0gZGF0YS5kYXRhLnNsaWNlKDIpO1xuICAgIHZhciBub3RJbmRleGVkUGFyYW1zID0gY29kZXIuZGVjb2RlUGFyYW1zKHRoaXMudHlwZXMoZmFsc2UpLCBub3RJbmRleGVkRGF0YSk7XG4gICAgXG4gICAgdmFyIHJlc3VsdCA9IGZvcm1hdHRlcnMub3V0cHV0TG9nRm9ybWF0dGVyKGRhdGEpO1xuICAgIHJlc3VsdC5ldmVudCA9IHRoaXMuZGlzcGxheU5hbWUoKTtcbiAgICByZXN1bHQuYWRkcmVzcyA9IGRhdGEuYWRkcmVzcztcblxuICAgIHJlc3VsdC5hcmdzID0gdGhpcy5fcGFyYW1zLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBjdXJyZW50KSB7XG4gICAgICAgIGFjY1tjdXJyZW50Lm5hbWVdID0gY3VycmVudC5pbmRleGVkID8gaW5kZXhlZFBhcmFtcy5zaGlmdCgpIDogbm90SW5kZXhlZFBhcmFtcy5zaGlmdCgpO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIGRlbGV0ZSByZXN1bHQuZGF0YTtcbiAgICBkZWxldGUgcmVzdWx0LnRvcGljcztcblxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGNyZWF0ZSBuZXcgZmlsdGVyIG9iamVjdCBmcm9tIGV2ZW50XG4gKlxuICogQG1ldGhvZCBleGVjdXRlXG4gKiBAcGFyYW0ge09iamVjdH0gaW5kZXhlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge09iamVjdH0gZmlsdGVyIG9iamVjdFxuICovXG5Tb2xpZGl0eUV2ZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKGluZGV4ZWQsIG9wdGlvbnMpIHtcbiAgICB2YXIgbyA9IHRoaXMuZW5jb2RlKGluZGV4ZWQsIG9wdGlvbnMpO1xuICAgIHZhciBmb3JtYXR0ZXIgPSB0aGlzLmRlY29kZS5iaW5kKHRoaXMpO1xuICAgIHJldHVybiB3ZWIzLmV0aC5maWx0ZXIobywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZvcm1hdHRlcik7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGF0dGFjaCBldmVudCB0byBjb250cmFjdCBvYmplY3RcbiAqXG4gKiBAbWV0aG9kIGF0dGFjaFRvQ29udHJhY3RcbiAqIEBwYXJhbSB7Q29udHJhY3R9XG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLmF0dGFjaFRvQ29udHJhY3QgPSBmdW5jdGlvbiAoY29udHJhY3QpIHtcbiAgICB2YXIgZXhlY3V0ZSA9IHRoaXMuZXhlY3V0ZS5iaW5kKHRoaXMpO1xuICAgIHZhciBkaXNwbGF5TmFtZSA9IHRoaXMuZGlzcGxheU5hbWUoKTtcbiAgICBpZiAoIWNvbnRyYWN0W2Rpc3BsYXlOYW1lXSkge1xuICAgICAgICBjb250cmFjdFtkaXNwbGF5TmFtZV0gPSBleGVjdXRlO1xuICAgIH1cbiAgICBjb250cmFjdFtkaXNwbGF5TmFtZV1bdGhpcy50eXBlTmFtZSgpXSA9IHRoaXMuZXhlY3V0ZS5iaW5kKHRoaXMsIGNvbnRyYWN0KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU29saWRpdHlFdmVudDtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUgZmlsdGVyLmpzXG4gKiBAYXV0aG9yczpcbiAqICAgSmVmZnJleSBXaWxja2UgPGplZmZAZXRoZGV2LmNvbT5cbiAqICAgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiAgIE1hcmlhbiBPYW5jZWEgPG1hcmlhbkBldGhkZXYuY29tPlxuICogICBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZXRoZGV2LmNvbT5cbiAqICAgR2F2IFdvb2QgPGdAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTRcbiAqL1xuXG52YXIgUmVxdWVzdE1hbmFnZXIgPSByZXF1aXJlKCcuL3JlcXVlc3RtYW5hZ2VyJyk7XG52YXIgZm9ybWF0dGVycyA9IHJlcXVpcmUoJy4vZm9ybWF0dGVycycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxuLyoqXG4qIENvbnZlcnRzIGEgZ2l2ZW4gdG9waWMgdG8gYSBoZXggc3RyaW5nLCBidXQgYWxzbyBhbGxvd3MgbnVsbCB2YWx1ZXMuXG4qXG4qIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4qIEByZXR1cm4ge1N0cmluZ31cbiovXG52YXIgdG9Ub3BpYyA9IGZ1bmN0aW9uKHZhbHVlKXtcblxuICAgIGlmKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgdmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuXG4gICAgaWYodmFsdWUuaW5kZXhPZignMHgnKSA9PT0gMClcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIHV0aWxzLmZyb21Bc2NpaSh2YWx1ZSk7XG59O1xuXG4vLy8gVGhpcyBtZXRob2Qgc2hvdWxkIGJlIGNhbGxlZCBvbiBvcHRpb25zIG9iamVjdCwgdG8gdmVyaWZ5IGRlcHJlY2F0ZWQgcHJvcGVydGllcyAmJiBsYXp5IGxvYWQgZHluYW1pYyBvbmVzXG4vLy8gQHBhcmFtIHNob3VsZCBiZSBzdHJpbmcgb3Igb2JqZWN0XG4vLy8gQHJldHVybnMgb3B0aW9ucyBzdHJpbmcgb3Igb2JqZWN0XG52YXIgZ2V0T3B0aW9ucyA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cbiAgICBpZiAodXRpbHMuaXNTdHJpbmcob3B0aW9ucykpIHtcbiAgICAgICAgcmV0dXJuIG9wdGlvbnM7XG4gICAgfSBcblxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgLy8gbWFrZSBzdXJlIHRvcGljcywgZ2V0IGNvbnZlcnRlZCB0byBoZXhcbiAgICBvcHRpb25zLnRvcGljcyA9IG9wdGlvbnMudG9waWNzIHx8IFtdO1xuICAgIG9wdGlvbnMudG9waWNzID0gb3B0aW9ucy50b3BpY3MubWFwKGZ1bmN0aW9uKHRvcGljKXtcbiAgICAgICAgcmV0dXJuICh1dGlscy5pc0FycmF5KHRvcGljKSkgPyB0b3BpYy5tYXAodG9Ub3BpYykgOiB0b1RvcGljKHRvcGljKTtcbiAgICB9KTtcblxuICAgIC8vIGxhenkgbG9hZFxuICAgIHJldHVybiB7XG4gICAgICAgIHRvcGljczogb3B0aW9ucy50b3BpY3MsXG4gICAgICAgIHRvOiBvcHRpb25zLnRvLFxuICAgICAgICBhZGRyZXNzOiBvcHRpb25zLmFkZHJlc3MsXG4gICAgICAgIGZyb21CbG9jazogZm9ybWF0dGVycy5pbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyKG9wdGlvbnMuZnJvbUJsb2NrKSxcbiAgICAgICAgdG9CbG9jazogZm9ybWF0dGVycy5pbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyKG9wdGlvbnMudG9CbG9jaykgXG4gICAgfTsgXG59O1xuXG52YXIgRmlsdGVyID0gZnVuY3Rpb24gKG9wdGlvbnMsIG1ldGhvZHMsIGZvcm1hdHRlcikge1xuICAgIHZhciBpbXBsZW1lbnRhdGlvbiA9IHt9O1xuICAgIG1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbiAobWV0aG9kKSB7XG4gICAgICAgIG1ldGhvZC5hdHRhY2hUb09iamVjdChpbXBsZW1lbnRhdGlvbik7XG4gICAgfSk7XG4gICAgdGhpcy5vcHRpb25zID0gZ2V0T3B0aW9ucyhvcHRpb25zKTtcbiAgICB0aGlzLmltcGxlbWVudGF0aW9uID0gaW1wbGVtZW50YXRpb247XG4gICAgdGhpcy5jYWxsYmFja3MgPSBbXTtcbiAgICB0aGlzLmZvcm1hdHRlciA9IGZvcm1hdHRlcjtcbiAgICB0aGlzLmZpbHRlcklkID0gdGhpcy5pbXBsZW1lbnRhdGlvbi5uZXdGaWx0ZXIodGhpcy5vcHRpb25zKTtcbn07XG5cbkZpbHRlci5wcm90b3R5cGUud2F0Y2ggPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICB0aGlzLmNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgb25NZXNzYWdlID0gZnVuY3Rpb24gKGVycm9yLCBtZXNzYWdlcykge1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbWVzc2FnZXMuZm9yRWFjaChmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgbWVzc2FnZSA9IHNlbGYuZm9ybWF0dGVyID8gc2VsZi5mb3JtYXR0ZXIobWVzc2FnZSkgOiBtZXNzYWdlO1xuICAgICAgICAgICAgc2VsZi5jYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgLy8gY2FsbCBnZXRGaWx0ZXJMb2dzIG9uIHN0YXJ0XG4gICAgaWYgKCF1dGlscy5pc1N0cmluZyh0aGlzLm9wdGlvbnMpKSB7XG4gICAgICAgIHRoaXMuZ2V0KGZ1bmN0aW9uIChlcnIsIG1lc3NhZ2VzKSB7XG4gICAgICAgICAgICAvLyBkb24ndCBzZW5kIGFsbCB0aGUgcmVzcG9uc2VzIHRvIGFsbCB0aGUgd2F0Y2hlcyBhZ2Fpbi4uLiBqdXN0IHRvIHRoaXMgb25lXG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbWVzc2FnZXMuZm9yRWFjaChmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc3RhcnRQb2xsaW5nKHtcbiAgICAgICAgbWV0aG9kOiB0aGlzLmltcGxlbWVudGF0aW9uLnBvbGwuY2FsbCxcbiAgICAgICAgcGFyYW1zOiBbdGhpcy5maWx0ZXJJZF0sXG4gICAgfSwgdGhpcy5maWx0ZXJJZCwgb25NZXNzYWdlLCB0aGlzLnN0b3BXYXRjaGluZy5iaW5kKHRoaXMpKTtcbn07XG5cbkZpbHRlci5wcm90b3R5cGUuc3RvcFdhdGNoaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc3RvcFBvbGxpbmcodGhpcy5maWx0ZXJJZCk7XG4gICAgdGhpcy5pbXBsZW1lbnRhdGlvbi51bmluc3RhbGxGaWx0ZXIodGhpcy5maWx0ZXJJZCk7XG4gICAgdGhpcy5jYWxsYmFja3MgPSBbXTtcbn07XG5cbkZpbHRlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICh1dGlscy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgICAgICB0aGlzLmltcGxlbWVudGF0aW9uLmdldExvZ3ModGhpcy5maWx0ZXJJZCwgZnVuY3Rpb24oZXJyLCByZXMpe1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlcy5tYXAoZnVuY3Rpb24gKGxvZykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5mb3JtYXR0ZXIgPyBzZWxmLmZvcm1hdHRlcihsb2cpIDogbG9nO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGxvZ3MgPSB0aGlzLmltcGxlbWVudGF0aW9uLmdldExvZ3ModGhpcy5maWx0ZXJJZCk7XG4gICAgICAgIHJldHVybiBsb2dzLm1hcChmdW5jdGlvbiAobG9nKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5mb3JtYXR0ZXIgPyBzZWxmLmZvcm1hdHRlcihsb2cpIDogbG9nO1xuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZpbHRlcjtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogXG4gKiBAZmlsZSBmb3JtYXR0ZXJzLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGF1dGhvciBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4uL3V0aWxzL2NvbmZpZycpO1xuXG4vKipcbiAqIFNob3VsZCB0aGUgZm9ybWF0IG91dHB1dCB0byBhIGJpZyBudW1iZXJcbiAqXG4gKiBAbWV0aG9kIG91dHB1dEJpZ051bWJlckZvcm1hdHRlclxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfEJpZ051bWJlcn1cbiAqIEByZXR1cm5zIHtCaWdOdW1iZXJ9IG9iamVjdFxuICovXG52YXIgb3V0cHV0QmlnTnVtYmVyRm9ybWF0dGVyID0gZnVuY3Rpb24gKG51bWJlcikge1xuICAgIHJldHVybiB1dGlscy50b0JpZ051bWJlcihudW1iZXIpO1xufTtcblxudmFyIGlzUHJlZGVmaW5lZEJsb2NrTnVtYmVyID0gZnVuY3Rpb24gKGJsb2NrTnVtYmVyKSB7XG4gICAgcmV0dXJuIGJsb2NrTnVtYmVyID09PSAnbGF0ZXN0JyB8fCBibG9ja051bWJlciA9PT0gJ3BlbmRpbmcnIHx8IGJsb2NrTnVtYmVyID09PSAnZWFybGllc3QnO1xufTtcblxudmFyIGlucHV0RGVmYXVsdEJsb2NrTnVtYmVyRm9ybWF0dGVyID0gZnVuY3Rpb24gKGJsb2NrTnVtYmVyKSB7XG4gICAgaWYgKGJsb2NrTnVtYmVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGNvbmZpZy5kZWZhdWx0QmxvY2s7XG4gICAgfVxuICAgIHJldHVybiBpbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyKGJsb2NrTnVtYmVyKTtcbn07XG5cbnZhciBpbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyID0gZnVuY3Rpb24gKGJsb2NrTnVtYmVyKSB7XG4gICAgaWYgKGJsb2NrTnVtYmVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGVsc2UgaWYgKGlzUHJlZGVmaW5lZEJsb2NrTnVtYmVyKGJsb2NrTnVtYmVyKSkge1xuICAgICAgICByZXR1cm4gYmxvY2tOdW1iZXI7XG4gICAgfVxuICAgIHJldHVybiB1dGlscy50b0hleChibG9ja051bWJlcik7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIGlucHV0IG9mIGEgdHJhbnNhY3Rpb24gYW5kIGNvbnZlcnRzIGFsbCB2YWx1ZXMgdG8gSEVYXG4gKlxuICogQG1ldGhvZCBpbnB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH0gdHJhbnNhY3Rpb24gb3B0aW9uc1xuICogQHJldHVybnMgb2JqZWN0XG4qL1xudmFyIGlucHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXIgPSBmdW5jdGlvbiAob3B0aW9ucyl7XG5cbiAgICBvcHRpb25zLmZyb20gPSBvcHRpb25zLmZyb20gfHwgY29uZmlnLmRlZmF1bHRBY2NvdW50O1xuXG4gICAgLy8gbWFrZSBjb2RlIC0+IGRhdGFcbiAgICBpZiAob3B0aW9ucy5jb2RlKSB7XG4gICAgICAgIG9wdGlvbnMuZGF0YSA9IG9wdGlvbnMuY29kZTtcbiAgICAgICAgZGVsZXRlIG9wdGlvbnMuY29kZTtcbiAgICB9XG5cbiAgICBbJ2dhc1ByaWNlJywgJ2dhcycsICd2YWx1ZScsICdub25jZSddLmZpbHRlcihmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiBvcHRpb25zW2tleV0gIT09IHVuZGVmaW5lZDtcbiAgICB9KS5mb3JFYWNoKGZ1bmN0aW9uKGtleSl7XG4gICAgICAgIG9wdGlvbnNba2V5XSA9IHV0aWxzLmZyb21EZWNpbWFsKG9wdGlvbnNba2V5XSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gb3B0aW9uczsgXG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIG91dHB1dCBvZiBhIHRyYW5zYWN0aW9uIHRvIGl0cyBwcm9wZXIgdmFsdWVzXG4gKiBcbiAqIEBtZXRob2Qgb3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSB0cmFuc2FjdGlvblxuICogQHJldHVybnMge09iamVjdH0gdHJhbnNhY3Rpb25cbiovXG52YXIgb3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXIgPSBmdW5jdGlvbiAodHgpe1xuICAgIHR4LmJsb2NrTnVtYmVyID0gdXRpbHMudG9EZWNpbWFsKHR4LmJsb2NrTnVtYmVyKTtcbiAgICB0eC50cmFuc2FjdGlvbkluZGV4ID0gdXRpbHMudG9EZWNpbWFsKHR4LnRyYW5zYWN0aW9uSW5kZXgpO1xuICAgIHR4Lm5vbmNlID0gdXRpbHMudG9EZWNpbWFsKHR4Lm5vbmNlKTtcbiAgICB0eC5nYXMgPSB1dGlscy50b0RlY2ltYWwodHguZ2FzKTtcbiAgICB0eC5nYXNQcmljZSA9IHV0aWxzLnRvQmlnTnVtYmVyKHR4Lmdhc1ByaWNlKTtcbiAgICB0eC52YWx1ZSA9IHV0aWxzLnRvQmlnTnVtYmVyKHR4LnZhbHVlKTtcbiAgICByZXR1cm4gdHg7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIG91dHB1dCBvZiBhIGJsb2NrIHRvIGl0cyBwcm9wZXIgdmFsdWVzXG4gKlxuICogQG1ldGhvZCBvdXRwdXRCbG9ja0Zvcm1hdHRlclxuICogQHBhcmFtIHtPYmplY3R9IGJsb2NrIG9iamVjdCBcbiAqIEByZXR1cm5zIHtPYmplY3R9IGJsb2NrIG9iamVjdFxuKi9cbnZhciBvdXRwdXRCbG9ja0Zvcm1hdHRlciA9IGZ1bmN0aW9uKGJsb2NrKSB7XG5cbiAgICAvLyB0cmFuc2Zvcm0gdG8gbnVtYmVyXG4gICAgYmxvY2suZ2FzTGltaXQgPSB1dGlscy50b0RlY2ltYWwoYmxvY2suZ2FzTGltaXQpO1xuICAgIGJsb2NrLmdhc1VzZWQgPSB1dGlscy50b0RlY2ltYWwoYmxvY2suZ2FzVXNlZCk7XG4gICAgYmxvY2suc2l6ZSA9IHV0aWxzLnRvRGVjaW1hbChibG9jay5zaXplKTtcbiAgICBibG9jay50aW1lc3RhbXAgPSB1dGlscy50b0RlY2ltYWwoYmxvY2sudGltZXN0YW1wKTtcbiAgICBibG9jay5udW1iZXIgPSB1dGlscy50b0RlY2ltYWwoYmxvY2subnVtYmVyKTtcblxuICAgIGJsb2NrLmRpZmZpY3VsdHkgPSB1dGlscy50b0JpZ051bWJlcihibG9jay5kaWZmaWN1bHR5KTtcbiAgICBibG9jay50b3RhbERpZmZpY3VsdHkgPSB1dGlscy50b0JpZ051bWJlcihibG9jay50b3RhbERpZmZpY3VsdHkpO1xuXG4gICAgaWYgKHV0aWxzLmlzQXJyYXkoYmxvY2sudHJhbnNhY3Rpb25zKSkge1xuICAgICAgICBibG9jay50cmFuc2FjdGlvbnMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgICAgIGlmKCF1dGlscy5pc1N0cmluZyhpdGVtKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gb3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXIoaXRlbSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBibG9jaztcbn07XG5cbi8qKlxuICogRm9ybWF0cyB0aGUgb3V0cHV0IG9mIGEgbG9nXG4gKiBcbiAqIEBtZXRob2Qgb3V0cHV0TG9nRm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH0gbG9nIG9iamVjdFxuICogQHJldHVybnMge09iamVjdH0gbG9nXG4qL1xudmFyIG91dHB1dExvZ0Zvcm1hdHRlciA9IGZ1bmN0aW9uKGxvZykge1xuICAgIGlmIChsb2cgPT09IG51bGwpIHsgLy8gJ3BlbmRpbmcnICYmICdsYXRlc3QnIGZpbHRlcnMgYXJlIG51bGxzXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxvZy5ibG9ja051bWJlciA9IHV0aWxzLnRvRGVjaW1hbChsb2cuYmxvY2tOdW1iZXIpO1xuICAgIGxvZy50cmFuc2FjdGlvbkluZGV4ID0gdXRpbHMudG9EZWNpbWFsKGxvZy50cmFuc2FjdGlvbkluZGV4KTtcbiAgICBsb2cubG9nSW5kZXggPSB1dGlscy50b0RlY2ltYWwobG9nLmxvZ0luZGV4KTtcblxuICAgIHJldHVybiBsb2c7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIGlucHV0IG9mIGEgd2hpc3BlciBwb3N0IGFuZCBjb252ZXJ0cyBhbGwgdmFsdWVzIHRvIEhFWFxuICpcbiAqIEBtZXRob2QgaW5wdXRQb3N0Rm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH0gdHJhbnNhY3Rpb24gb2JqZWN0XG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuKi9cbnZhciBpbnB1dFBvc3RGb3JtYXR0ZXIgPSBmdW5jdGlvbihwb3N0KSB7XG5cbiAgICBwb3N0LnBheWxvYWQgPSB1dGlscy50b0hleChwb3N0LnBheWxvYWQpO1xuICAgIHBvc3QudHRsID0gdXRpbHMuZnJvbURlY2ltYWwocG9zdC50dGwpO1xuICAgIHBvc3Qud29ya1RvUHJvdmUgPSB1dGlscy5mcm9tRGVjaW1hbChwb3N0LndvcmtUb1Byb3ZlKTtcbiAgICBwb3N0LnByaW9yaXR5ID0gdXRpbHMuZnJvbURlY2ltYWwocG9zdC5wcmlvcml0eSk7XG5cbiAgICAvLyBmYWxsYmFja1xuICAgIGlmICghdXRpbHMuaXNBcnJheShwb3N0LnRvcGljcykpIHtcbiAgICAgICAgcG9zdC50b3BpY3MgPSBwb3N0LnRvcGljcyA/IFtwb3N0LnRvcGljc10gOiBbXTtcbiAgICB9XG5cbiAgICAvLyBmb3JtYXQgdGhlIGZvbGxvd2luZyBvcHRpb25zXG4gICAgcG9zdC50b3BpY3MgPSBwb3N0LnRvcGljcy5tYXAoZnVuY3Rpb24odG9waWMpe1xuICAgICAgICByZXR1cm4gdXRpbHMuZnJvbUFzY2lpKHRvcGljKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBwb3N0OyBcbn07XG5cbi8qKlxuICogRm9ybWF0cyB0aGUgb3V0cHV0IG9mIGEgcmVjZWl2ZWQgcG9zdCBtZXNzYWdlXG4gKlxuICogQG1ldGhvZCBvdXRwdXRQb3N0Rm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm5zIHtPYmplY3R9XG4gKi9cbnZhciBvdXRwdXRQb3N0Rm9ybWF0dGVyID0gZnVuY3Rpb24ocG9zdCl7XG5cbiAgICBwb3N0LmV4cGlyeSA9IHV0aWxzLnRvRGVjaW1hbChwb3N0LmV4cGlyeSk7XG4gICAgcG9zdC5zZW50ID0gdXRpbHMudG9EZWNpbWFsKHBvc3Quc2VudCk7XG4gICAgcG9zdC50dGwgPSB1dGlscy50b0RlY2ltYWwocG9zdC50dGwpO1xuICAgIHBvc3Qud29ya1Byb3ZlZCA9IHV0aWxzLnRvRGVjaW1hbChwb3N0LndvcmtQcm92ZWQpO1xuICAgIHBvc3QucGF5bG9hZFJhdyA9IHBvc3QucGF5bG9hZDtcbiAgICBwb3N0LnBheWxvYWQgPSB1dGlscy50b0FzY2lpKHBvc3QucGF5bG9hZCk7XG5cbiAgICBpZiAodXRpbHMuaXNKc29uKHBvc3QucGF5bG9hZCkpIHtcbiAgICAgICAgcG9zdC5wYXlsb2FkID0gSlNPTi5wYXJzZShwb3N0LnBheWxvYWQpO1xuICAgIH1cblxuICAgIC8vIGZvcm1hdCB0aGUgZm9sbG93aW5nIG9wdGlvbnNcbiAgICBpZiAoIXBvc3QudG9waWNzKSB7XG4gICAgICAgIHBvc3QudG9waWNzID0gW107XG4gICAgfVxuICAgIHBvc3QudG9waWNzID0gcG9zdC50b3BpY3MubWFwKGZ1bmN0aW9uKHRvcGljKXtcbiAgICAgICAgcmV0dXJuIHV0aWxzLnRvQXNjaWkodG9waWMpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHBvc3Q7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBpbnB1dERlZmF1bHRCbG9ja051bWJlckZvcm1hdHRlcjogaW5wdXREZWZhdWx0QmxvY2tOdW1iZXJGb3JtYXR0ZXIsXG4gICAgaW5wdXRCbG9ja051bWJlckZvcm1hdHRlcjogaW5wdXRCbG9ja051bWJlckZvcm1hdHRlcixcbiAgICBpbnB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyOiBpbnB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyLFxuICAgIGlucHV0UG9zdEZvcm1hdHRlcjogaW5wdXRQb3N0Rm9ybWF0dGVyLFxuICAgIG91dHB1dEJpZ051bWJlckZvcm1hdHRlcjogb3V0cHV0QmlnTnVtYmVyRm9ybWF0dGVyLFxuICAgIG91dHB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyOiBvdXRwdXRUcmFuc2FjdGlvbkZvcm1hdHRlcixcbiAgICBvdXRwdXRCbG9ja0Zvcm1hdHRlcjogb3V0cHV0QmxvY2tGb3JtYXR0ZXIsXG4gICAgb3V0cHV0TG9nRm9ybWF0dGVyOiBvdXRwdXRMb2dGb3JtYXR0ZXIsXG4gICAgb3V0cHV0UG9zdEZvcm1hdHRlcjogb3V0cHV0UG9zdEZvcm1hdHRlclxufTtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKipcbiAqIEBmaWxlIGZ1bmN0aW9uLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciB3ZWIzID0gcmVxdWlyZSgnLi4vd2ViMycpO1xudmFyIGNvZGVyID0gcmVxdWlyZSgnLi4vc29saWRpdHkvY29kZXInKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG5cbi8qKlxuICogVGhpcyBwcm90b3R5cGUgc2hvdWxkIGJlIHVzZWQgdG8gY2FsbC9zZW5kVHJhbnNhY3Rpb24gdG8gc29saWRpdHkgZnVuY3Rpb25zXG4gKi9cbnZhciBTb2xpZGl0eUZ1bmN0aW9uID0gZnVuY3Rpb24gKGpzb24sIGFkZHJlc3MpIHtcbiAgICB0aGlzLl9pbnB1dFR5cGVzID0ganNvbi5pbnB1dHMubWFwKGZ1bmN0aW9uIChpKSB7XG4gICAgICAgIHJldHVybiBpLnR5cGU7XG4gICAgfSk7XG4gICAgdGhpcy5fb3V0cHV0VHlwZXMgPSBqc29uLm91dHB1dHMubWFwKGZ1bmN0aW9uIChpKSB7XG4gICAgICAgIHJldHVybiBpLnR5cGU7XG4gICAgfSk7XG4gICAgdGhpcy5fY29uc3RhbnQgPSBqc29uLmNvbnN0YW50O1xuICAgIHRoaXMuX25hbWUgPSB1dGlscy50cmFuc2Zvcm1Ub0Z1bGxOYW1lKGpzb24pO1xuICAgIHRoaXMuX2FkZHJlc3MgPSBhZGRyZXNzO1xufTtcblxuU29saWRpdHlGdW5jdGlvbi5wcm90b3R5cGUuZXh0cmFjdENhbGxiYWNrID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICBpZiAodXRpbHMuaXNGdW5jdGlvbihhcmdzW2FyZ3MubGVuZ3RoIC0gMV0pKSB7XG4gICAgICAgIHJldHVybiBhcmdzLnBvcCgpOyAvLyBtb2RpZnkgdGhlIGFyZ3MgYXJyYXkhXG4gICAgfVxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBjcmVhdGUgcGF5bG9hZCBmcm9tIGFyZ3VtZW50c1xuICpcbiAqIEBtZXRob2QgdG9QYXlsb2FkXG4gKiBAcGFyYW0ge0FycmF5fSBzb2xpZGl0eSBmdW5jdGlvbiBwYXJhbXNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25hbCBwYXlsb2FkIG9wdGlvbnNcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbmFsIGNhbGxiYWNrIGZ1bmN0aW9uIHRvIHVzZSBhc3luY2hyb25vdXMgcmVxdWVzdHMuXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLnRvUGF5bG9hZCA9IGZ1bmN0aW9uIChhcmdzLCBjYWxsYmFjaykge1xuICAgIHZhciBvcHRpb25zID0ge307XG4gICAgaWYgKGFyZ3MubGVuZ3RoID4gdGhpcy5faW5wdXRUeXBlcy5sZW5ndGggJiYgdXRpbHMuaXNPYmplY3QoYXJnc1thcmdzLmxlbmd0aCAtMV0pKSB7XG4gICAgICAgIG9wdGlvbnMgPSBhcmdzW2FyZ3MubGVuZ3RoIC0gMV07XG4gICAgfVxuXG4gICAgb3B0aW9ucy50byA9IHRoaXMuX2FkZHJlc3M7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKGNhbGxiYWNrICE9IG51bGwpIHtcbiAgICAgICAgdGhpcy5zaWduYXR1cmUoZnVuY3Rpb24oZXJyb3IsIHNpZ25hdHVyZSkge1xuICAgICAgICAgICAgaWYgKGVycm9yID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRhdGEgPSAnMHgnICsgc2lnbmF0dXJlICsgY29kZXIuZW5jb2RlUGFyYW1zKHNlbGYuX2lucHV0VHlwZXMsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjYWxsYmFjayhlcnJvciwgb3B0aW9ucyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybjsgXG4gICAgfVxuXG4gICAgb3B0aW9ucy5kYXRhID0gJzB4JyArIHRoaXMuc2lnbmF0dXJlKCkgKyBjb2Rlci5lbmNvZGVQYXJhbXModGhpcy5faW5wdXRUeXBlcywgYXJncyk7XG4gICAgcmV0dXJuIG9wdGlvbnM7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGdldCBmdW5jdGlvbiBzaWduYXR1cmVcbiAqXG4gKiBAbWV0aG9kIHNpZ25hdHVyZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9uYWwgY2FsbGJhY2sgZnVuY3Rpb24gdG8gdXNlIGFzeW5jaHJvbm91cyByZXF1ZXN0cy5cbiAqIEByZXR1cm4ge1N0cmluZ30gZnVuY3Rpb24gc2lnbmF0dXJlXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLnNpZ25hdHVyZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgIGlmIChjYWxsYmFjayAhPSBudWxsKSB7XG4gICAgICAgIHdlYjMuc2hhMyh3ZWIzLmZyb21Bc2NpaSh0aGlzLl9uYW1lKSwgZnVuY3Rpb24oZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGVycm9yID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuc2xpY2UoMiwgMTApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IsIHJlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB3ZWIzLnNoYTMod2ViMy5mcm9tQXNjaWkodGhpcy5fbmFtZSkpLnNsaWNlKDIsIDEwKTtcbiAgICB9XG59O1xuXG5cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLnVucGFja091dHB1dCA9IGZ1bmN0aW9uIChvdXRwdXQpIHtcbiAgICBpZiAob3V0cHV0ID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBvdXRwdXQgPSBvdXRwdXQubGVuZ3RoID49IDIgPyBvdXRwdXQuc2xpY2UoMikgOiBvdXRwdXQ7XG4gICAgdmFyIHJlc3VsdCA9IGNvZGVyLmRlY29kZVBhcmFtcyh0aGlzLl9vdXRwdXRUeXBlcywgb3V0cHV0KTtcbiAgICByZXR1cm4gcmVzdWx0Lmxlbmd0aCA9PT0gMSA/IHJlc3VsdFswXSA6IHJlc3VsdDtcbn07XG5cbi8qKlxuICogQ2FsbHMgYSBjb250cmFjdCBmdW5jdGlvbi5cbiAqXG4gKiBAbWV0aG9kIGNhbGxcbiAqIEBwYXJhbSB7Li4uT2JqZWN0fSBDb250cmFjdCBmdW5jdGlvbiBhcmd1bWVudHNcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IElmIHRoZSBsYXN0IGFyZ3VtZW50IGlzIGEgZnVuY3Rpb24sIHRoZSBjb250cmFjdCBmdW5jdGlvblxuICogICBjYWxsIHdpbGwgYmUgYXN5bmNocm9ub3VzLCBhbmQgdGhlIGNhbGxiYWNrIHdpbGwgYmUgcGFzc2VkIHRoZVxuICogICBlcnJvciBhbmQgcmVzdWx0LlxuICogQHJldHVybiB7U3RyaW5nfSBvdXRwdXQgYnl0ZXNcbiAqL1xuU29saWRpdHlGdW5jdGlvbi5wcm90b3R5cGUuY2FsbCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgdmFyIGNhbGxiYWNrID0gdGhpcy5leHRyYWN0Q2FsbGJhY2soYXJncyk7XG5cbiAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBwYXlsb2FkID0gdGhpcy50b1BheWxvYWQoYXJncyk7XG4gICAgICAgIHZhciBvdXRwdXQgPSB3ZWIzLmV0aC5jYWxsKHBheWxvYWQpO1xuICAgICAgICByZXR1cm4gdGhpcy51bnBhY2tPdXRwdXQob3V0cHV0KTtcbiAgICB9IFxuICAgICAgICBcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdGhpcy50b1BheWxvYWQoYXJncywgZnVuY3Rpb24oZXJyb3IsIHBheWxvYWQpIHtcbiAgICAgICAgaWYgKGVycm9yICE9IG51bGwpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCBwYXlsb2FkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHdlYjMuZXRoLmNhbGwocGF5bG9hZCwgZnVuY3Rpb24gKGVycm9yLCBvdXRwdXQpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCBzZWxmLnVucGFja091dHB1dChvdXRwdXQpKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIHNlbmRUcmFuc2FjdGlvbiB0byBzb2xpZGl0eSBmdW5jdGlvblxuICpcbiAqIEBtZXRob2Qgc2VuZFRyYW5zYWN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICovXG5Tb2xpZGl0eUZ1bmN0aW9uLnByb3RvdHlwZS5zZW5kVHJhbnNhY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHZhciBjYWxsYmFjayA9IHRoaXMuZXh0cmFjdENhbGxiYWNrKGFyZ3MpO1xuXG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICB2YXIgcGF5bG9hZCA9IHRoaXMudG9QYXlsb2FkKGFyZ3MpO1xuICAgICAgICB3ZWIzLmV0aC5zZW5kVHJhbnNhY3Rpb24ocGF5bG9hZCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnRvUGF5bG9hZChhcmdzLCBmdW5jdGlvbihlcnJvciwgcGF5bG9hZCkge1xuICAgICAgICBpZiAoZXJyb3IgIT0gbnVsbCkge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IsIHBheWxvYWQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgd2ViMy5ldGguc2VuZFRyYW5zYWN0aW9uKHBheWxvYWQsIGNhbGxiYWNrKTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZ2V0IGZ1bmN0aW9uIGRpc3BsYXkgbmFtZVxuICpcbiAqIEBtZXRob2QgZGlzcGxheU5hbWVcbiAqIEByZXR1cm4ge1N0cmluZ30gZGlzcGxheSBuYW1lIG9mIHRoZSBmdW5jdGlvblxuICovXG5Tb2xpZGl0eUZ1bmN0aW9uLnByb3RvdHlwZS5kaXNwbGF5TmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdXRpbHMuZXh0cmFjdERpc3BsYXlOYW1lKHRoaXMuX25hbWUpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgZnVuY3Rpb24gdHlwZSBuYW1lXG4gKlxuICogQG1ldGhvZCB0eXBlTmFtZVxuICogQHJldHVybiB7U3RyaW5nfSB0eXBlIG5hbWUgb2YgdGhlIGZ1bmN0aW9uXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLnR5cGVOYW1lID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB1dGlscy5leHRyYWN0VHlwZU5hbWUodGhpcy5fbmFtZSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gZ2V0IHJwYyByZXF1ZXN0cyBmcm9tIHNvbGlkaXR5IGZ1bmN0aW9uXG4gKlxuICogQG1ldGhvZCByZXF1ZXN0XG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuICovXG5Tb2xpZGl0eUZ1bmN0aW9uLnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmV4dHJhY3RDYWxsYmFjayhhcmdzKTtcbiAgICB2YXIgcGF5bG9hZCA9IHRoaXMudG9QYXlsb2FkKGFyZ3MpO1xuICAgIHZhciBmb3JtYXQgPSB0aGlzLnVucGFja091dHB1dC5iaW5kKHRoaXMpO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgICAgcGF5bG9hZDogcGF5bG9hZCwgXG4gICAgICAgIGZvcm1hdDogZm9ybWF0XG4gICAgfTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBleGVjdXRlIGZ1bmN0aW9uXG4gKlxuICogQG1ldGhvZCBleGVjdXRlXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRyYW5zYWN0aW9uID0gIXRoaXMuX2NvbnN0YW50O1xuXG4gICAgLy8gc2VuZCB0cmFuc2FjdGlvblxuICAgIGlmICh0cmFuc2FjdGlvbikge1xuICAgICAgICByZXR1cm4gdGhpcy5zZW5kVHJhbnNhY3Rpb24uYXBwbHkodGhpcywgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG4gICAgfVxuXG4gICAgLy8gY2FsbFxuICAgIHJldHVybiB0aGlzLmNhbGwuYXBwbHkodGhpcywgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gYXR0YWNoIGZ1bmN0aW9uIHRvIGNvbnRyYWN0XG4gKlxuICogQG1ldGhvZCBhdHRhY2hUb0NvbnRyYWN0XG4gKiBAcGFyYW0ge0NvbnRyYWN0fVxuICovXG5Tb2xpZGl0eUZ1bmN0aW9uLnByb3RvdHlwZS5hdHRhY2hUb0NvbnRyYWN0ID0gZnVuY3Rpb24gKGNvbnRyYWN0KSB7XG4gICAgdmFyIGV4ZWN1dGUgPSB0aGlzLmV4ZWN1dGUuYmluZCh0aGlzKTtcbiAgICBleGVjdXRlLnJlcXVlc3QgPSB0aGlzLnJlcXVlc3QuYmluZCh0aGlzKTtcbiAgICBleGVjdXRlLmNhbGwgPSB0aGlzLmNhbGwuYmluZCh0aGlzKTtcbiAgICBleGVjdXRlLnNlbmRUcmFuc2FjdGlvbiA9IHRoaXMuc2VuZFRyYW5zYWN0aW9uLmJpbmQodGhpcyk7XG4gICAgdmFyIGRpc3BsYXlOYW1lID0gdGhpcy5kaXNwbGF5TmFtZSgpO1xuICAgIGlmICghY29udHJhY3RbZGlzcGxheU5hbWVdKSB7XG4gICAgICAgIGNvbnRyYWN0W2Rpc3BsYXlOYW1lXSA9IGV4ZWN1dGU7XG4gICAgfVxuICAgIGNvbnRyYWN0W2Rpc3BsYXlOYW1lXVt0aGlzLnR5cGVOYW1lKCldID0gZXhlY3V0ZTsgLy8gY2lyY3VsYXIhISEhXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNvbGlkaXR5RnVuY3Rpb247XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIEBmaWxlIGh0dHBwcm92aWRlci5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogICBNYXJpYW4gT2FuY2VhIDxtYXJpYW5AZXRoZGV2LmNvbT5cbiAqICAgRmFiaWFuIFZvZ2Vsc3RlbGxlciA8ZmFiaWFuQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE0XG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBYTUxIdHRwUmVxdWVzdCA9IHJlcXVpcmUoJ3htbGh0dHByZXF1ZXN0JykuWE1MSHR0cFJlcXVlc3Q7IC8vIGpzaGludCBpZ25vcmU6bGluZVxudmFyIGVycm9ycyA9IHJlcXVpcmUoJy4vZXJyb3JzJyk7XG5cbnZhciBIdHRwUHJvdmlkZXIgPSBmdW5jdGlvbiAoaG9zdCkge1xuICAgIHRoaXMuaG9zdCA9IGhvc3QgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6ODU0NSc7XG59O1xuXG5IdHRwUHJvdmlkZXIucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbiAocGF5bG9hZCkge1xuICAgIHZhciByZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cbiAgICByZXF1ZXN0Lm9wZW4oJ1BPU1QnLCB0aGlzLmhvc3QsIGZhbHNlKTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgICByZXF1ZXN0LnNlbmQoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpO1xuICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXJyb3JzLkludmFsaWRDb25uZWN0aW9uKHRoaXMuaG9zdCk7XG4gICAgfVxuXG5cbiAgICAvLyBjaGVjayByZXF1ZXN0LnN0YXR1c1xuICAgIC8vIFRPRE86IHRocm93IGFuIGVycm9yIGhlcmUhIGl0IGNhbm5vdCBzaWxlbnRseSBmYWlsISEhXG4gICAgLy9pZiAocmVxdWVzdC5zdGF0dXMgIT09IDIwMCkge1xuICAgICAgICAvL3JldHVybjtcbiAgICAvL31cblxuICAgIHZhciByZXN1bHQgPSByZXF1ZXN0LnJlc3BvbnNlVGV4dDtcblxuICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IEpTT04ucGFyc2UocmVzdWx0KTtcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3JzLkludmFsaWRSZXNwb25zZShyZXN1bHQpOyAgICAgICAgICAgICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuSHR0cFByb3ZpZGVyLnByb3RvdHlwZS5zZW5kQXN5bmMgPSBmdW5jdGlvbiAocGF5bG9hZCwgY2FsbGJhY2spIHtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSByZXF1ZXN0LnJlc3BvbnNlVGV4dDtcbiAgICAgICAgICAgIHZhciBlcnJvciA9IG51bGw7XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gSlNPTi5wYXJzZShyZXN1bHQpO1xuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IgPSBlcnJvcnMuSW52YWxpZFJlc3BvbnNlKHJlc3VsdCk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYWxsYmFjayhlcnJvciwgcmVzdWx0KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICByZXF1ZXN0Lm9wZW4oJ1BPU1QnLCB0aGlzLmhvc3QsIHRydWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgcmVxdWVzdC5zZW5kKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKTtcbiAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgIGNhbGxiYWNrKGVycm9ycy5JbnZhbGlkQ29ubmVjdGlvbih0aGlzLmhvc3QpKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEh0dHBQcm92aWRlcjtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUganNvbnJwYy5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBKc29ucnBjID0gZnVuY3Rpb24gKCkge1xuICAgIC8vIHNpbmdsZXRvbiBwYXR0ZXJuXG4gICAgaWYgKGFyZ3VtZW50cy5jYWxsZWUuX3NpbmdsZXRvbkluc3RhbmNlKSB7XG4gICAgICAgIHJldHVybiBhcmd1bWVudHMuY2FsbGVlLl9zaW5nbGV0b25JbnN0YW5jZTtcbiAgICB9XG4gICAgYXJndW1lbnRzLmNhbGxlZS5fc2luZ2xldG9uSW5zdGFuY2UgPSB0aGlzO1xuXG4gICAgdGhpcy5tZXNzYWdlSWQgPSAxO1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIHtKc29ucnBjfSBzaW5nbGV0b25cbiAqL1xuSnNvbnJwYy5nZXRJbnN0YW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBuZXcgSnNvbnJwYygpO1xuICAgIHJldHVybiBpbnN0YW5jZTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byB2YWxpZCBqc29uIGNyZWF0ZSBwYXlsb2FkIG9iamVjdFxuICpcbiAqIEBtZXRob2QgdG9QYXlsb2FkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBtZXRob2Qgb2YganNvbnJwYyBjYWxsLCByZXF1aXJlZFxuICogQHBhcmFtIHtBcnJheX0gcGFyYW1zLCBhbiBhcnJheSBvZiBtZXRob2QgcGFyYW1zLCBvcHRpb25hbFxuICogQHJldHVybnMge09iamVjdH0gdmFsaWQganNvbnJwYyBwYXlsb2FkIG9iamVjdFxuICovXG5Kc29ucnBjLnByb3RvdHlwZS50b1BheWxvYWQgPSBmdW5jdGlvbiAobWV0aG9kLCBwYXJhbXMpIHtcbiAgICBpZiAoIW1ldGhvZClcbiAgICAgICAgY29uc29sZS5lcnJvcignanNvbnJwYyBtZXRob2Qgc2hvdWxkIGJlIHNwZWNpZmllZCEnKTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgICBtZXRob2Q6IG1ldGhvZCxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMgfHwgW10sXG4gICAgICAgIGlkOiB0aGlzLm1lc3NhZ2VJZCsrXG4gICAgfTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBjaGVjayBpZiBqc29ucnBjIHJlc3BvbnNlIGlzIHZhbGlkXG4gKlxuICogQG1ldGhvZCBpc1ZhbGlkUmVzcG9uc2VcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgcmVzcG9uc2UgaXMgdmFsaWQsIG90aGVyd2lzZSBmYWxzZVxuICovXG5Kc29ucnBjLnByb3RvdHlwZS5pc1ZhbGlkUmVzcG9uc2UgPSBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICByZXR1cm4gISFyZXNwb25zZSAmJlxuICAgICAgICAhcmVzcG9uc2UuZXJyb3IgJiZcbiAgICAgICAgcmVzcG9uc2UuanNvbnJwYyA9PT0gJzIuMCcgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlLmlkID09PSAnbnVtYmVyJyAmJlxuICAgICAgICByZXNwb25zZS5yZXN1bHQgIT09IHVuZGVmaW5lZDsgLy8gb25seSB1bmRlZmluZWQgaXMgbm90IHZhbGlkIGpzb24gb2JqZWN0XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gY3JlYXRlIGJhdGNoIHBheWxvYWQgb2JqZWN0XG4gKlxuICogQG1ldGhvZCB0b0JhdGNoUGF5bG9hZFxuICogQHBhcmFtIHtBcnJheX0gbWVzc2FnZXMsIGFuIGFycmF5IG9mIG9iamVjdHMgd2l0aCBtZXRob2QgKHJlcXVpcmVkKSBhbmQgcGFyYW1zIChvcHRpb25hbCkgZmllbGRzXG4gKiBAcmV0dXJucyB7QXJyYXl9IGJhdGNoIHBheWxvYWRcbiAqL1xuSnNvbnJwYy5wcm90b3R5cGUudG9CYXRjaFBheWxvYWQgPSBmdW5jdGlvbiAobWVzc2FnZXMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIG1lc3NhZ2VzLm1hcChmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gc2VsZi50b1BheWxvYWQobWVzc2FnZS5tZXRob2QsIG1lc3NhZ2UucGFyYW1zKTtcbiAgICB9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSnNvbnJwYztcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKipcbiAqIEBmaWxlIG1ldGhvZC5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgUmVxdWVzdE1hbmFnZXIgPSByZXF1aXJlKCcuL3JlcXVlc3RtYW5hZ2VyJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIGVycm9ycyA9IHJlcXVpcmUoJy4vZXJyb3JzJyk7XG5cbnZhciBNZXRob2QgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIHRoaXMubmFtZSA9IG9wdGlvbnMubmFtZTtcbiAgICB0aGlzLmNhbGwgPSBvcHRpb25zLmNhbGw7XG4gICAgdGhpcy5wYXJhbXMgPSBvcHRpb25zLnBhcmFtcyB8fCAwO1xuICAgIHRoaXMuaW5wdXRGb3JtYXR0ZXIgPSBvcHRpb25zLmlucHV0Rm9ybWF0dGVyO1xuICAgIHRoaXMub3V0cHV0Rm9ybWF0dGVyID0gb3B0aW9ucy5vdXRwdXRGb3JtYXR0ZXI7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGRldGVybWluZSBuYW1lIG9mIHRoZSBqc29ucnBjIG1ldGhvZCBiYXNlZCBvbiBhcmd1bWVudHNcbiAqXG4gKiBAbWV0aG9kIGdldENhbGxcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3VtZW50c1xuICogQHJldHVybiB7U3RyaW5nfSBuYW1lIG9mIGpzb25ycGMgbWV0aG9kXG4gKi9cbk1ldGhvZC5wcm90b3R5cGUuZ2V0Q2FsbCA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgcmV0dXJuIHV0aWxzLmlzRnVuY3Rpb24odGhpcy5jYWxsKSA/IHRoaXMuY2FsbChhcmdzKSA6IHRoaXMuY2FsbDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZXh0cmFjdCBjYWxsYmFjayBmcm9tIGFycmF5IG9mIGFyZ3VtZW50cy4gTW9kaWZpZXMgaW5wdXQgcGFyYW1cbiAqXG4gKiBAbWV0aG9kIGV4dHJhY3RDYWxsYmFja1xuICogQHBhcmFtIHtBcnJheX0gYXJndW1lbnRzXG4gKiBAcmV0dXJuIHtGdW5jdGlvbnxOdWxsfSBjYWxsYmFjaywgaWYgZXhpc3RzXG4gKi9cbk1ldGhvZC5wcm90b3R5cGUuZXh0cmFjdENhbGxiYWNrID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICBpZiAodXRpbHMuaXNGdW5jdGlvbihhcmdzW2FyZ3MubGVuZ3RoIC0gMV0pKSB7XG4gICAgICAgIHJldHVybiBhcmdzLnBvcCgpOyAvLyBtb2RpZnkgdGhlIGFyZ3MgYXJyYXkhXG4gICAgfVxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNoZWNrIGlmIHRoZSBudW1iZXIgb2YgYXJndW1lbnRzIGlzIGNvcnJlY3RcbiAqIFxuICogQG1ldGhvZCB2YWxpZGF0ZUFyZ3NcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3VtZW50c1xuICogQHRocm93cyB7RXJyb3J9IGlmIGl0IGlzIG5vdFxuICovXG5NZXRob2QucHJvdG90eXBlLnZhbGlkYXRlQXJncyA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgaWYgKGFyZ3MubGVuZ3RoICE9PSB0aGlzLnBhcmFtcykge1xuICAgICAgICB0aHJvdyBlcnJvcnMuSW52YWxpZE51bWJlck9mUGFyYW1zKCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGZvcm1hdCBpbnB1dCBhcmdzIG9mIG1ldGhvZFxuICogXG4gKiBAbWV0aG9kIGZvcm1hdElucHV0XG4gKiBAcGFyYW0ge0FycmF5fVxuICogQHJldHVybiB7QXJyYXl9XG4gKi9cbk1ldGhvZC5wcm90b3R5cGUuZm9ybWF0SW5wdXQgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIGlmICghdGhpcy5pbnB1dEZvcm1hdHRlcikge1xuICAgICAgICByZXR1cm4gYXJncztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5pbnB1dEZvcm1hdHRlci5tYXAoZnVuY3Rpb24gKGZvcm1hdHRlciwgaW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlciA/IGZvcm1hdHRlcihhcmdzW2luZGV4XSkgOiBhcmdzW2luZGV4XTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBmb3JtYXQgb3V0cHV0KHJlc3VsdCkgb2YgbWV0aG9kXG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXRcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5NZXRob2QucHJvdG90eXBlLmZvcm1hdE91dHB1dCA9IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICByZXR1cm4gdGhpcy5vdXRwdXRGb3JtYXR0ZXIgJiYgcmVzdWx0ICE9PSBudWxsID8gdGhpcy5vdXRwdXRGb3JtYXR0ZXIocmVzdWx0KSA6IHJlc3VsdDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGF0dGFjaCBmdW5jdGlvbiB0byBtZXRob2RcbiAqIFxuICogQG1ldGhvZCBhdHRhY2hUb09iamVjdFxuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufVxuICovXG5NZXRob2QucHJvdG90eXBlLmF0dGFjaFRvT2JqZWN0ID0gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBmdW5jID0gdGhpcy5zZW5kLmJpbmQodGhpcyk7XG4gICAgZnVuYy5yZXF1ZXN0ID0gdGhpcy5yZXF1ZXN0LmJpbmQodGhpcyk7XG4gICAgZnVuYy5jYWxsID0gdGhpcy5jYWxsOyAvLyB0aGF0J3MgdWdseS4gZmlsdGVyLmpzIHVzZXMgaXRcbiAgICB2YXIgbmFtZSA9IHRoaXMubmFtZS5zcGxpdCgnLicpO1xuICAgIGlmIChuYW1lLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgb2JqW25hbWVbMF1dID0gb2JqW25hbWVbMF1dIHx8IHt9O1xuICAgICAgICBvYmpbbmFtZVswXV1bbmFtZVsxXV0gPSBmdW5jO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG9ialtuYW1lWzBdXSA9IGZ1bmM7IFxuICAgIH1cbn07XG5cbi8qKlxuICogU2hvdWxkIGNyZWF0ZSBwYXlsb2FkIGZyb20gZ2l2ZW4gaW5wdXQgYXJnc1xuICpcbiAqIEBtZXRob2QgdG9QYXlsb2FkXG4gKiBAcGFyYW0ge0FycmF5fSBhcmdzXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cbk1ldGhvZC5wcm90b3R5cGUudG9QYXlsb2FkID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICB2YXIgY2FsbCA9IHRoaXMuZ2V0Q2FsbChhcmdzKTtcbiAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmV4dHJhY3RDYWxsYmFjayhhcmdzKTtcbiAgICB2YXIgcGFyYW1zID0gdGhpcy5mb3JtYXRJbnB1dChhcmdzKTtcbiAgICB0aGlzLnZhbGlkYXRlQXJncyhwYXJhbXMpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWV0aG9kOiBjYWxsLFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrXG4gICAgfTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBjcmVhdGUgcHVyZSBKU09OUlBDIHJlcXVlc3Qgd2hpY2ggY2FuIGJlIHVzZWQgaW4gYmF0Y2ggcmVxdWVzdFxuICpcbiAqIEBtZXRob2QgcmVxdWVzdFxuICogQHBhcmFtIHsuLi59IHBhcmFtc1xuICogQHJldHVybiB7T2JqZWN0fSBqc29ucnBjIHJlcXVlc3RcbiAqL1xuTWV0aG9kLnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXlsb2FkID0gdGhpcy50b1BheWxvYWQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG4gICAgcGF5bG9hZC5mb3JtYXQgPSB0aGlzLmZvcm1hdE91dHB1dC5iaW5kKHRoaXMpO1xuICAgIHJldHVybiBwYXlsb2FkO1xufTtcblxuLyoqXG4gKiBTaG91bGQgc2VuZCByZXF1ZXN0IHRvIHRoZSBBUElcbiAqXG4gKiBAbWV0aG9kIHNlbmRcbiAqIEBwYXJhbSBsaXN0IG9mIHBhcmFtc1xuICogQHJldHVybiByZXN1bHRcbiAqL1xuTWV0aG9kLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXlsb2FkID0gdGhpcy50b1BheWxvYWQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG4gICAgaWYgKHBheWxvYWQuY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICByZXR1cm4gUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UoKS5zZW5kQXN5bmMocGF5bG9hZCwgZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7XG4gICAgICAgICAgICBwYXlsb2FkLmNhbGxiYWNrKGVyciwgc2VsZi5mb3JtYXRPdXRwdXQocmVzdWx0KSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5mb3JtYXRPdXRwdXQoUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UoKS5zZW5kKHBheWxvYWQpKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTWV0aG9kO1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBAZmlsZSBldGguanNcbiAqIEBhdXRob3JzOlxuICogICBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIFByb3BlcnR5ID0gcmVxdWlyZSgnLi9wcm9wZXJ0eScpO1xuXG4vLy8gQHJldHVybnMgYW4gYXJyYXkgb2Ygb2JqZWN0cyBkZXNjcmliaW5nIHdlYjMuZXRoIGFwaSBtZXRob2RzXG52YXIgbWV0aG9kcyA9IFtcbl07XG5cbi8vLyBAcmV0dXJucyBhbiBhcnJheSBvZiBvYmplY3RzIGRlc2NyaWJpbmcgd2ViMy5ldGggYXBpIHByb3BlcnRpZXNcbnZhciBwcm9wZXJ0aWVzID0gW1xuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICdsaXN0ZW5pbmcnLFxuICAgICAgICBnZXR0ZXI6ICduZXRfbGlzdGVuaW5nJ1xuICAgIH0pLFxuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICdwZWVyQ291bnQnLFxuICAgICAgICBnZXR0ZXI6ICduZXRfcGVlckNvdW50JyxcbiAgICAgICAgb3V0cHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbiAgICB9KVxuXTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBtZXRob2RzOiBtZXRob2RzLFxuICAgIHByb3BlcnRpZXM6IHByb3BlcnRpZXNcbn07XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqXG4gKiBAZmlsZSBwcm9wZXJ0eS5qc1xuICogQGF1dGhvciBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZnJvemVtYW4uZGU+XG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBSZXF1ZXN0TWFuYWdlciA9IHJlcXVpcmUoJy4vcmVxdWVzdG1hbmFnZXInKTtcblxudmFyIFByb3BlcnR5ID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICB0aGlzLm5hbWUgPSBvcHRpb25zLm5hbWU7XG4gICAgdGhpcy5nZXR0ZXIgPSBvcHRpb25zLmdldHRlcjtcbiAgICB0aGlzLnNldHRlciA9IG9wdGlvbnMuc2V0dGVyO1xuICAgIHRoaXMub3V0cHV0Rm9ybWF0dGVyID0gb3B0aW9ucy5vdXRwdXRGb3JtYXR0ZXI7XG4gICAgdGhpcy5pbnB1dEZvcm1hdHRlciA9IG9wdGlvbnMuaW5wdXRGb3JtYXR0ZXI7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gZm9ybWF0IGlucHV0IGFyZ3Mgb2YgbWV0aG9kXG4gKiBcbiAqIEBtZXRob2QgZm9ybWF0SW5wdXRcbiAqIEBwYXJhbSB7QXJyYXl9XG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqL1xuUHJvcGVydHkucHJvdG90eXBlLmZvcm1hdElucHV0ID0gZnVuY3Rpb24gKGFyZykge1xuICAgIHJldHVybiB0aGlzLmlucHV0Rm9ybWF0dGVyID8gdGhpcy5pbnB1dEZvcm1hdHRlcihhcmcpIDogYXJnO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGZvcm1hdCBvdXRwdXQocmVzdWx0KSBvZiBtZXRob2RcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dFxuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblByb3BlcnR5LnByb3RvdHlwZS5mb3JtYXRPdXRwdXQgPSBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgcmV0dXJuIHRoaXMub3V0cHV0Rm9ybWF0dGVyICYmIHJlc3VsdCAhPT0gbnVsbCA/IHRoaXMub3V0cHV0Rm9ybWF0dGVyKHJlc3VsdCkgOiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFNob3VsZCBhdHRhY2ggZnVuY3Rpb24gdG8gbWV0aG9kXG4gKiBcbiAqIEBtZXRob2QgYXR0YWNoVG9PYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHBhcmFtIHtGdW5jdGlvbn1cbiAqL1xuUHJvcGVydHkucHJvdG90eXBlLmF0dGFjaFRvT2JqZWN0ID0gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBwcm90byA9IHtcbiAgICAgICAgZ2V0OiB0aGlzLmdldC5iaW5kKHRoaXMpLFxuICAgIH07XG5cbiAgICB2YXIgbmFtZXMgPSB0aGlzLm5hbWUuc3BsaXQoJy4nKTtcbiAgICB2YXIgbmFtZSA9IG5hbWVzWzBdO1xuICAgIGlmIChuYW1lcy5sZW5ndGggPiAxKSB7XG4gICAgICAgIG9ialtuYW1lc1swXV0gPSBvYmpbbmFtZXNbMF1dIHx8IHt9O1xuICAgICAgICBvYmogPSBvYmpbbmFtZXNbMF1dO1xuICAgICAgICBuYW1lID0gbmFtZXNbMV07XG4gICAgfVxuICAgIFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIG5hbWUsIHByb3RvKTtcblxuICAgIHZhciB0b0FzeW5jTmFtZSA9IGZ1bmN0aW9uIChwcmVmaXgsIG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHByZWZpeCArIG5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnNsaWNlKDEpO1xuICAgIH07XG5cbiAgICBvYmpbdG9Bc3luY05hbWUoJ2dldCcsIG5hbWUpXSA9IHRoaXMuZ2V0QXN5bmMuYmluZCh0aGlzKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZ2V0IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eVxuICpcbiAqIEBtZXRob2QgZ2V0XG4gKiBAcmV0dXJuIHtPYmplY3R9IHZhbHVlIG9mIHRoZSBwcm9wZXJ0eVxuICovXG5Qcm9wZXJ0eS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmZvcm1hdE91dHB1dChSZXF1ZXN0TWFuYWdlci5nZXRJbnN0YW5jZSgpLnNlbmQoe1xuICAgICAgICBtZXRob2Q6IHRoaXMuZ2V0dGVyXG4gICAgfSkpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBhc3luY2hyb3Vub3VzbHkgZ2V0IHZhbHVlIG9mIHByb3BlcnR5XG4gKlxuICogQG1ldGhvZCBnZXRBc3luY1xuICogQHBhcmFtIHtGdW5jdGlvbn1cbiAqL1xuUHJvcGVydHkucHJvdG90eXBlLmdldEFzeW5jID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc2VuZEFzeW5jKHtcbiAgICAgICAgbWV0aG9kOiB0aGlzLmdldHRlclxuICAgIH0sIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBjYWxsYmFjayhlcnIsIHNlbGYuZm9ybWF0T3V0cHV0KHJlc3VsdCkpO1xuICAgIH0pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQcm9wZXJ0eTtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUgcXRzeW5jLmpzXG4gKiBAYXV0aG9yczpcbiAqICAgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiAgIE1hcmlhbiBPYW5jZWEgPG1hcmlhbkBldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNFxuICovXG5cbnZhciBRdFN5bmNQcm92aWRlciA9IGZ1bmN0aW9uICgpIHtcbn07XG5cblF0U3luY1Byb3ZpZGVyLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKHBheWxvYWQpIHtcbiAgICB2YXIgcmVzdWx0ID0gbmF2aWdhdG9yLnF0LmNhbGxNZXRob2QoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpO1xuICAgIHJldHVybiBKU09OLnBhcnNlKHJlc3VsdCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFF0U3luY1Byb3ZpZGVyO1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIHJlcXVlc3RtYW5hZ2VyLmpzXG4gKiBAYXV0aG9yIEplZmZyZXkgV2lsY2tlIDxqZWZmQGV0aGRldi5jb20+XG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGF1dGhvciBNYXJpYW4gT2FuY2VhIDxtYXJpYW5AZXRoZGV2LmNvbT5cbiAqIEBhdXRob3IgRmFiaWFuIFZvZ2Vsc3RlbGxlciA8ZmFiaWFuQGV0aGRldi5jb20+XG4gKiBAYXV0aG9yIEdhdiBXb29kIDxnQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE0XG4gKi9cblxudmFyIEpzb25ycGMgPSByZXF1aXJlKCcuL2pzb25ycGMnKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgYyA9IHJlcXVpcmUoJy4uL3V0aWxzL2NvbmZpZycpO1xudmFyIGVycm9ycyA9IHJlcXVpcmUoJy4vZXJyb3JzJyk7XG5cbi8qKlxuICogSXQncyByZXNwb25zaWJsZSBmb3IgcGFzc2luZyBtZXNzYWdlcyB0byBwcm92aWRlcnNcbiAqIEl0J3MgYWxzbyByZXNwb25zaWJsZSBmb3IgcG9sbGluZyB0aGUgZXRoZXJldW0gbm9kZSBmb3IgaW5jb21pbmcgbWVzc2FnZXNcbiAqIERlZmF1bHQgcG9sbCB0aW1lb3V0IGlzIDEgc2Vjb25kXG4gKiBTaW5nbGV0b25cbiAqL1xudmFyIFJlcXVlc3RNYW5hZ2VyID0gZnVuY3Rpb24gKHByb3ZpZGVyKSB7XG4gICAgLy8gc2luZ2xldG9uIHBhdHRlcm5cbiAgICBpZiAoYXJndW1lbnRzLmNhbGxlZS5fc2luZ2xldG9uSW5zdGFuY2UpIHtcbiAgICAgICAgcmV0dXJuIGFyZ3VtZW50cy5jYWxsZWUuX3NpbmdsZXRvbkluc3RhbmNlO1xuICAgIH1cbiAgICBhcmd1bWVudHMuY2FsbGVlLl9zaW5nbGV0b25JbnN0YW5jZSA9IHRoaXM7XG5cbiAgICB0aGlzLnByb3ZpZGVyID0gcHJvdmlkZXI7XG4gICAgdGhpcy5wb2xscyA9IFtdO1xuICAgIHRoaXMudGltZW91dCA9IG51bGw7XG4gICAgdGhpcy5wb2xsKCk7XG59O1xuXG4vKipcbiAqIEByZXR1cm4ge1JlcXVlc3RNYW5hZ2VyfSBzaW5nbGV0b25cbiAqL1xuUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGluc3RhbmNlID0gbmV3IFJlcXVlc3RNYW5hZ2VyKCk7XG4gICAgcmV0dXJuIGluc3RhbmNlO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBzeW5jaHJvbm91c2x5IHNlbmQgcmVxdWVzdFxuICpcbiAqIEBtZXRob2Qgc2VuZFxuICogQHBhcmFtIHtPYmplY3R9IGRhdGFcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuUmVxdWVzdE1hbmFnZXIucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIGlmICghdGhpcy5wcm92aWRlcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9ycy5JbnZhbGlkUHJvdmlkZXIoKSk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHZhciBwYXlsb2FkID0gSnNvbnJwYy5nZXRJbnN0YW5jZSgpLnRvUGF5bG9hZChkYXRhLm1ldGhvZCwgZGF0YS5wYXJhbXMpO1xuICAgIHZhciByZXN1bHQgPSB0aGlzLnByb3ZpZGVyLnNlbmQocGF5bG9hZCk7XG5cbiAgICBpZiAoIUpzb25ycGMuZ2V0SW5zdGFuY2UoKS5pc1ZhbGlkUmVzcG9uc2UocmVzdWx0KSkge1xuICAgICAgICB0aHJvdyBlcnJvcnMuSW52YWxpZFJlc3BvbnNlKHJlc3VsdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGFzeW5jaHJvbm91c2x5IHNlbmQgcmVxdWVzdFxuICpcbiAqIEBtZXRob2Qgc2VuZEFzeW5jXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAqL1xuUmVxdWVzdE1hbmFnZXIucHJvdG90eXBlLnNlbmRBc3luYyA9IGZ1bmN0aW9uIChkYXRhLCBjYWxsYmFjaykge1xuICAgIGlmICghdGhpcy5wcm92aWRlcikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3JzLkludmFsaWRQcm92aWRlcigpKTtcbiAgICB9XG5cbiAgICB2YXIgcGF5bG9hZCA9IEpzb25ycGMuZ2V0SW5zdGFuY2UoKS50b1BheWxvYWQoZGF0YS5tZXRob2QsIGRhdGEucGFyYW1zKTtcbiAgICB0aGlzLnByb3ZpZGVyLnNlbmRBc3luYyhwYXlsb2FkLCBmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghSnNvbnJwYy5nZXRJbnN0YW5jZSgpLmlzVmFsaWRSZXNwb25zZShyZXN1bHQpKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3JzLkludmFsaWRSZXNwb25zZShyZXN1bHQpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdC5yZXN1bHQpO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGFzeW5jaHJvbm91c2x5IHNlbmQgYmF0Y2ggcmVxdWVzdFxuICpcbiAqIEBtZXRob2Qgc2VuZEJhdGNoXG4gKiBAcGFyYW0ge0FycmF5fSBiYXRjaCBkYXRhXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUuc2VuZEJhdGNoID0gZnVuY3Rpb24gKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCF0aGlzLnByb3ZpZGVyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcnMuSW52YWxpZFByb3ZpZGVyKCkpO1xuICAgIH1cblxuICAgIHZhciBwYXlsb2FkID0gSnNvbnJwYy5nZXRJbnN0YW5jZSgpLnRvQmF0Y2hQYXlsb2FkKGRhdGEpO1xuXG4gICAgdGhpcy5wcm92aWRlci5zZW5kQXN5bmMocGF5bG9hZCwgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdXRpbHMuaXNBcnJheShyZXN1bHRzKSkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycm9ycy5JbnZhbGlkUmVzcG9uc2UocmVzdWx0cykpO1xuICAgICAgICB9XG5cbiAgICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHRzKTtcbiAgICB9KTsgXG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIHNldCBwcm92aWRlciBvZiByZXF1ZXN0IG1hbmFnZXJcbiAqXG4gKiBAbWV0aG9kIHNldFByb3ZpZGVyXG4gKiBAcGFyYW0ge09iamVjdH1cbiAqL1xuUmVxdWVzdE1hbmFnZXIucHJvdG90eXBlLnNldFByb3ZpZGVyID0gZnVuY3Rpb24gKHApIHtcbiAgICB0aGlzLnByb3ZpZGVyID0gcDtcbn07XG5cbi8qanNoaW50IG1heHBhcmFtczo0ICovXG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gc3RhcnQgcG9sbGluZ1xuICpcbiAqIEBtZXRob2Qgc3RhcnRQb2xsaW5nXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YVxuICogQHBhcmFtIHtOdW1iZXJ9IHBvbGxJZFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHVuaW5zdGFsbFxuICpcbiAqIEB0b2RvIGNsZWFudXAgbnVtYmVyIG9mIHBhcmFtc1xuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUuc3RhcnRQb2xsaW5nID0gZnVuY3Rpb24gKGRhdGEsIHBvbGxJZCwgY2FsbGJhY2ssIHVuaW5zdGFsbCkge1xuICAgIHRoaXMucG9sbHMucHVzaCh7ZGF0YTogZGF0YSwgaWQ6IHBvbGxJZCwgY2FsbGJhY2s6IGNhbGxiYWNrLCB1bmluc3RhbGw6IHVuaW5zdGFsbH0pO1xufTtcbi8qanNoaW50IG1heHBhcmFtczozICovXG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gc3RvcCBwb2xsaW5nIGZvciBmaWx0ZXIgd2l0aCBnaXZlbiBpZFxuICpcbiAqIEBtZXRob2Qgc3RvcFBvbGxpbmdcbiAqIEBwYXJhbSB7TnVtYmVyfSBwb2xsSWRcbiAqL1xuUmVxdWVzdE1hbmFnZXIucHJvdG90eXBlLnN0b3BQb2xsaW5nID0gZnVuY3Rpb24gKHBvbGxJZCkge1xuICAgIGZvciAodmFyIGkgPSB0aGlzLnBvbGxzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICB2YXIgcG9sbCA9IHRoaXMucG9sbHNbaV07XG4gICAgICAgIGlmIChwb2xsLmlkID09PSBwb2xsSWQpIHtcbiAgICAgICAgICAgIHRoaXMucG9sbHMuc3BsaWNlKGksIDEpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIHJlc2V0IHBvbGxpbmcgbWVjaGFuaXNtIG9mIHJlcXVlc3QgbWFuYWdlclxuICpcbiAqIEBtZXRob2QgcmVzZXRcbiAqL1xuUmVxdWVzdE1hbmFnZXIucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMucG9sbHMuZm9yRWFjaChmdW5jdGlvbiAocG9sbCkge1xuICAgICAgICBwb2xsLnVuaW5zdGFsbChwb2xsLmlkKTsgXG4gICAgfSk7XG4gICAgdGhpcy5wb2xscyA9IFtdO1xuXG4gICAgaWYgKHRoaXMudGltZW91dCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KTtcbiAgICAgICAgdGhpcy50aW1lb3V0ID0gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5wb2xsKCk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gcG9sbCBmb3IgY2hhbmdlcyBvbiBmaWx0ZXIgd2l0aCBnaXZlbiBpZFxuICpcbiAqIEBtZXRob2QgcG9sbFxuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUucG9sbCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMucG9sbC5iaW5kKHRoaXMpLCBjLkVUSF9QT0xMSU5HX1RJTUVPVVQpO1xuXG4gICAgaWYgKCF0aGlzLnBvbGxzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnByb3ZpZGVyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3JzLkludmFsaWRQcm92aWRlcigpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwYXlsb2FkID0gSnNvbnJwYy5nZXRJbnN0YW5jZSgpLnRvQmF0Y2hQYXlsb2FkKHRoaXMucG9sbHMubWFwKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHJldHVybiBkYXRhLmRhdGE7XG4gICAgfSkpO1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMucHJvdmlkZXIuc2VuZEFzeW5jKHBheWxvYWQsIGZ1bmN0aW9uIChlcnJvciwgcmVzdWx0cykge1xuICAgICAgICAvLyBUT0RPOiBjb25zb2xlIGxvZz9cbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICBpZiAoIXV0aWxzLmlzQXJyYXkocmVzdWx0cykpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9ycy5JbnZhbGlkUmVzcG9uc2UocmVzdWx0cyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHRzLm1hcChmdW5jdGlvbiAocmVzdWx0LCBpbmRleCkge1xuICAgICAgICAgICAgcmVzdWx0LmNhbGxiYWNrID0gc2VsZi5wb2xsc1tpbmRleF0uY2FsbGJhY2s7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9KS5maWx0ZXIoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgdmFyIHZhbGlkID0gSnNvbnJwYy5nZXRJbnN0YW5jZSgpLmlzVmFsaWRSZXNwb25zZShyZXN1bHQpO1xuICAgICAgICAgICAgaWYgKCF2YWxpZCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5jYWxsYmFjayhlcnJvcnMuSW52YWxpZFJlc3BvbnNlKHJlc3VsdCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHZhbGlkO1xuICAgICAgICB9KS5maWx0ZXIoZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcmV0dXJuIHV0aWxzLmlzQXJyYXkocmVzdWx0LnJlc3VsdCkgJiYgcmVzdWx0LnJlc3VsdC5sZW5ndGggPiAwO1xuICAgICAgICB9KS5mb3JFYWNoKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHJlc3VsdC5jYWxsYmFjayhudWxsLCByZXN1bHQucmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFJlcXVlc3RNYW5hZ2VyO1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBAZmlsZSBzaGguanNcbiAqIEBhdXRob3JzOlxuICogICBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgTWV0aG9kID0gcmVxdWlyZSgnLi9tZXRob2QnKTtcbnZhciBmb3JtYXR0ZXJzID0gcmVxdWlyZSgnLi9mb3JtYXR0ZXJzJyk7XG5cbnZhciBwb3N0ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ3Bvc3QnLCBcbiAgICBjYWxsOiAnc2hoX3Bvc3QnLCBcbiAgICBwYXJhbXM6IDEsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0UG9zdEZvcm1hdHRlcl1cbn0pO1xuXG52YXIgbmV3SWRlbnRpdHkgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnbmV3SWRlbnRpdHknLFxuICAgIGNhbGw6ICdzaGhfbmV3SWRlbnRpdHknLFxuICAgIHBhcmFtczogMFxufSk7XG5cbnZhciBoYXNJZGVudGl0eSA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdoYXNJZGVudGl0eScsXG4gICAgY2FsbDogJ3NoaF9oYXNJZGVudGl0eScsXG4gICAgcGFyYW1zOiAxXG59KTtcblxudmFyIG5ld0dyb3VwID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ25ld0dyb3VwJyxcbiAgICBjYWxsOiAnc2hoX25ld0dyb3VwJyxcbiAgICBwYXJhbXM6IDBcbn0pO1xuXG52YXIgYWRkVG9Hcm91cCA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdhZGRUb0dyb3VwJyxcbiAgICBjYWxsOiAnc2hoX2FkZFRvR3JvdXAnLFxuICAgIHBhcmFtczogMFxufSk7XG5cbnZhciBtZXRob2RzID0gW1xuICAgIHBvc3QsXG4gICAgbmV3SWRlbnRpdHksXG4gICAgaGFzSWRlbnRpdHksXG4gICAgbmV3R3JvdXAsXG4gICAgYWRkVG9Hcm91cFxuXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbWV0aG9kczogbWV0aG9kc1xufTtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUgd2F0Y2hlcy5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBNZXRob2QgPSByZXF1aXJlKCcuL21ldGhvZCcpO1xuXG4vLy8gQHJldHVybnMgYW4gYXJyYXkgb2Ygb2JqZWN0cyBkZXNjcmliaW5nIHdlYjMuZXRoLmZpbHRlciBhcGkgbWV0aG9kc1xudmFyIGV0aCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbmV3RmlsdGVyQ2FsbCA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgICAgIHZhciB0eXBlID0gYXJnc1swXTtcblxuICAgICAgICBzd2l0Y2godHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnbGF0ZXN0JzpcbiAgICAgICAgICAgICAgICBhcmdzLnBvcCgpO1xuICAgICAgICAgICAgICAgIHRoaXMucGFyYW1zID0gMDtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2V0aF9uZXdCbG9ja0ZpbHRlcic7XG4gICAgICAgICAgICBjYXNlICdwZW5kaW5nJzpcbiAgICAgICAgICAgICAgICBhcmdzLnBvcCgpO1xuICAgICAgICAgICAgICAgIHRoaXMucGFyYW1zID0gMDtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2V0aF9uZXdQZW5kaW5nVHJhbnNhY3Rpb25GaWx0ZXInO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2V0aF9uZXdGaWx0ZXInO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciBuZXdGaWx0ZXIgPSBuZXcgTWV0aG9kKHtcbiAgICAgICAgbmFtZTogJ25ld0ZpbHRlcicsXG4gICAgICAgIGNhbGw6IG5ld0ZpbHRlckNhbGwsXG4gICAgICAgIHBhcmFtczogMVxuICAgIH0pO1xuXG4gICAgdmFyIHVuaW5zdGFsbEZpbHRlciA9IG5ldyBNZXRob2Qoe1xuICAgICAgICBuYW1lOiAndW5pbnN0YWxsRmlsdGVyJyxcbiAgICAgICAgY2FsbDogJ2V0aF91bmluc3RhbGxGaWx0ZXInLFxuICAgICAgICBwYXJhbXM6IDFcbiAgICB9KTtcblxuICAgIHZhciBnZXRMb2dzID0gbmV3IE1ldGhvZCh7XG4gICAgICAgIG5hbWU6ICdnZXRMb2dzJyxcbiAgICAgICAgY2FsbDogJ2V0aF9nZXRGaWx0ZXJMb2dzJyxcbiAgICAgICAgcGFyYW1zOiAxXG4gICAgfSk7XG5cbiAgICB2YXIgcG9sbCA9IG5ldyBNZXRob2Qoe1xuICAgICAgICBuYW1lOiAncG9sbCcsXG4gICAgICAgIGNhbGw6ICdldGhfZ2V0RmlsdGVyQ2hhbmdlcycsXG4gICAgICAgIHBhcmFtczogMVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIFtcbiAgICAgICAgbmV3RmlsdGVyLFxuICAgICAgICB1bmluc3RhbGxGaWx0ZXIsXG4gICAgICAgIGdldExvZ3MsXG4gICAgICAgIHBvbGxcbiAgICBdO1xufTtcblxuLy8vIEByZXR1cm5zIGFuIGFycmF5IG9mIG9iamVjdHMgZGVzY3JpYmluZyB3ZWIzLnNoaC53YXRjaCBhcGkgbWV0aG9kc1xudmFyIHNoaCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbmV3RmlsdGVyID0gbmV3IE1ldGhvZCh7XG4gICAgICAgIG5hbWU6ICduZXdGaWx0ZXInLFxuICAgICAgICBjYWxsOiAnc2hoX25ld0ZpbHRlcicsXG4gICAgICAgIHBhcmFtczogMVxuICAgIH0pO1xuXG4gICAgdmFyIHVuaW5zdGFsbEZpbHRlciA9IG5ldyBNZXRob2Qoe1xuICAgICAgICBuYW1lOiAndW5pbnN0YWxsRmlsdGVyJyxcbiAgICAgICAgY2FsbDogJ3NoaF91bmluc3RhbGxGaWx0ZXInLFxuICAgICAgICBwYXJhbXM6IDFcbiAgICB9KTtcblxuICAgIHZhciBnZXRMb2dzID0gbmV3IE1ldGhvZCh7XG4gICAgICAgIG5hbWU6ICdnZXRMb2dzJyxcbiAgICAgICAgY2FsbDogJ3NoaF9nZXRNZXNzYWdlcycsXG4gICAgICAgIHBhcmFtczogMVxuICAgIH0pO1xuXG4gICAgdmFyIHBvbGwgPSBuZXcgTWV0aG9kKHtcbiAgICAgICAgbmFtZTogJ3BvbGwnLFxuICAgICAgICBjYWxsOiAnc2hoX2dldEZpbHRlckNoYW5nZXMnLFxuICAgICAgICBwYXJhbXM6IDFcbiAgICB9KTtcblxuICAgIHJldHVybiBbXG4gICAgICAgIG5ld0ZpbHRlcixcbiAgICAgICAgdW5pbnN0YWxsRmlsdGVyLFxuICAgICAgICBnZXRMb2dzLFxuICAgICAgICBwb2xsXG4gICAgXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGV0aDogZXRoLFxuICAgIHNoaDogc2hoXG59O1xuXG4iLG51bGwsIi8qISBiaWdudW1iZXIuanMgdjIuMC43IGh0dHBzOi8vZ2l0aHViLmNvbS9NaWtlTWNsL2JpZ251bWJlci5qcy9MSUNFTkNFICovXG5cbjsoZnVuY3Rpb24gKGdsb2JhbCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8qXG4gICAgICBiaWdudW1iZXIuanMgdjIuMC43XG4gICAgICBBIEphdmFTY3JpcHQgbGlicmFyeSBmb3IgYXJiaXRyYXJ5LXByZWNpc2lvbiBhcml0aG1ldGljLlxuICAgICAgaHR0cHM6Ly9naXRodWIuY29tL01pa2VNY2wvYmlnbnVtYmVyLmpzXG4gICAgICBDb3B5cmlnaHQgKGMpIDIwMTUgTWljaGFlbCBNY2xhdWdobGluIDxNOGNoODhsQGdtYWlsLmNvbT5cbiAgICAgIE1JVCBFeHBhdCBMaWNlbmNlXG4gICAgKi9cblxuXG4gICAgdmFyIEJpZ051bWJlciwgY3J5cHRvLCBwYXJzZU51bWVyaWMsXG4gICAgICAgIGlzTnVtZXJpYyA9IC9eLT8oXFxkKyhcXC5cXGQqKT98XFwuXFxkKykoZVsrLV0/XFxkKyk/JC9pLFxuICAgICAgICBtYXRoY2VpbCA9IE1hdGguY2VpbCxcbiAgICAgICAgbWF0aGZsb29yID0gTWF0aC5mbG9vcixcbiAgICAgICAgbm90Qm9vbCA9ICcgbm90IGEgYm9vbGVhbiBvciBiaW5hcnkgZGlnaXQnLFxuICAgICAgICByb3VuZGluZ01vZGUgPSAncm91bmRpbmcgbW9kZScsXG4gICAgICAgIHRvb01hbnlEaWdpdHMgPSAnbnVtYmVyIHR5cGUgaGFzIG1vcmUgdGhhbiAxNSBzaWduaWZpY2FudCBkaWdpdHMnLFxuICAgICAgICBBTFBIQUJFVCA9ICcwMTIzNDU2Nzg5YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWiRfJyxcbiAgICAgICAgQkFTRSA9IDFlMTQsXG4gICAgICAgIExPR19CQVNFID0gMTQsXG4gICAgICAgIE1BWF9TQUZFX0lOVEVHRVIgPSAweDFmZmZmZmZmZmZmZmZmLCAgICAgICAgIC8vIDJeNTMgLSAxXG4gICAgICAgIC8vIE1BWF9JTlQzMiA9IDB4N2ZmZmZmZmYsICAgICAgICAgICAgICAgICAgIC8vIDJeMzEgLSAxXG4gICAgICAgIFBPV1NfVEVOID0gWzEsIDEwLCAxMDAsIDFlMywgMWU0LCAxZTUsIDFlNiwgMWU3LCAxZTgsIDFlOSwgMWUxMCwgMWUxMSwgMWUxMiwgMWUxM10sXG4gICAgICAgIFNRUlRfQkFTRSA9IDFlNyxcblxuICAgICAgICAvKlxuICAgICAgICAgKiBUaGUgbGltaXQgb24gdGhlIHZhbHVlIG9mIERFQ0lNQUxfUExBQ0VTLCBUT19FWFBfTkVHLCBUT19FWFBfUE9TLCBNSU5fRVhQLCBNQVhfRVhQLCBhbmRcbiAgICAgICAgICogdGhlIGFyZ3VtZW50cyB0byB0b0V4cG9uZW50aWFsLCB0b0ZpeGVkLCB0b0Zvcm1hdCwgYW5kIHRvUHJlY2lzaW9uLCBiZXlvbmQgd2hpY2ggYW5cbiAgICAgICAgICogZXhjZXB0aW9uIGlzIHRocm93biAoaWYgRVJST1JTIGlzIHRydWUpLlxuICAgICAgICAgKi9cbiAgICAgICAgTUFYID0gMUU5OyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMCB0byBNQVhfSU5UMzJcblxuXG4gICAgLypcbiAgICAgKiBDcmVhdGUgYW5kIHJldHVybiBhIEJpZ051bWJlciBjb25zdHJ1Y3Rvci5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhbm90aGVyKGNvbmZpZ09iaikge1xuICAgICAgICB2YXIgZGl2LFxuXG4gICAgICAgICAgICAvLyBpZCB0cmFja3MgdGhlIGNhbGxlciBmdW5jdGlvbiwgc28gaXRzIG5hbWUgY2FuIGJlIGluY2x1ZGVkIGluIGVycm9yIG1lc3NhZ2VzLlxuICAgICAgICAgICAgaWQgPSAwLFxuICAgICAgICAgICAgUCA9IEJpZ051bWJlci5wcm90b3R5cGUsXG4gICAgICAgICAgICBPTkUgPSBuZXcgQmlnTnVtYmVyKDEpLFxuXG5cbiAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogRURJVEFCTEUgREVGQVVMVFMgKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgICogVGhlIGRlZmF1bHQgdmFsdWVzIGJlbG93IG11c3QgYmUgaW50ZWdlcnMgd2l0aGluIHRoZSBpbmNsdXNpdmUgcmFuZ2VzIHN0YXRlZC5cbiAgICAgICAgICAgICAqIFRoZSB2YWx1ZXMgY2FuIGFsc28gYmUgY2hhbmdlZCBhdCBydW4tdGltZSB1c2luZyBCaWdOdW1iZXIuY29uZmlnLlxuICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgIC8vIFRoZSBtYXhpbXVtIG51bWJlciBvZiBkZWNpbWFsIHBsYWNlcyBmb3Igb3BlcmF0aW9ucyBpbnZvbHZpbmcgZGl2aXNpb24uXG4gICAgICAgICAgICBERUNJTUFMX1BMQUNFUyA9IDIwLCAgICAgICAgICAgICAgICAgICAgIC8vIDAgdG8gTUFYXG5cbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgKiBUaGUgcm91bmRpbmcgbW9kZSB1c2VkIHdoZW4gcm91bmRpbmcgdG8gdGhlIGFib3ZlIGRlY2ltYWwgcGxhY2VzLCBhbmQgd2hlbiB1c2luZ1xuICAgICAgICAgICAgICogdG9FeHBvbmVudGlhbCwgdG9GaXhlZCwgdG9Gb3JtYXQgYW5kIHRvUHJlY2lzaW9uLCBhbmQgcm91bmQgKGRlZmF1bHQgdmFsdWUpLlxuICAgICAgICAgICAgICogVVAgICAgICAgICAwIEF3YXkgZnJvbSB6ZXJvLlxuICAgICAgICAgICAgICogRE9XTiAgICAgICAxIFRvd2FyZHMgemVyby5cbiAgICAgICAgICAgICAqIENFSUwgICAgICAgMiBUb3dhcmRzICtJbmZpbml0eS5cbiAgICAgICAgICAgICAqIEZMT09SICAgICAgMyBUb3dhcmRzIC1JbmZpbml0eS5cbiAgICAgICAgICAgICAqIEhBTEZfVVAgICAgNCBUb3dhcmRzIG5lYXJlc3QgbmVpZ2hib3VyLiBJZiBlcXVpZGlzdGFudCwgdXAuXG4gICAgICAgICAgICAgKiBIQUxGX0RPV04gIDUgVG93YXJkcyBuZWFyZXN0IG5laWdoYm91ci4gSWYgZXF1aWRpc3RhbnQsIGRvd24uXG4gICAgICAgICAgICAgKiBIQUxGX0VWRU4gIDYgVG93YXJkcyBuZWFyZXN0IG5laWdoYm91ci4gSWYgZXF1aWRpc3RhbnQsIHRvd2FyZHMgZXZlbiBuZWlnaGJvdXIuXG4gICAgICAgICAgICAgKiBIQUxGX0NFSUwgIDcgVG93YXJkcyBuZWFyZXN0IG5laWdoYm91ci4gSWYgZXF1aWRpc3RhbnQsIHRvd2FyZHMgK0luZmluaXR5LlxuICAgICAgICAgICAgICogSEFMRl9GTE9PUiA4IFRvd2FyZHMgbmVhcmVzdCBuZWlnaGJvdXIuIElmIGVxdWlkaXN0YW50LCB0b3dhcmRzIC1JbmZpbml0eS5cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgUk9VTkRJTkdfTU9ERSA9IDQsICAgICAgICAgICAgICAgICAgICAgICAvLyAwIHRvIDhcblxuICAgICAgICAgICAgLy8gRVhQT05FTlRJQUxfQVQgOiBbVE9fRVhQX05FRyAsIFRPX0VYUF9QT1NdXG5cbiAgICAgICAgICAgIC8vIFRoZSBleHBvbmVudCB2YWx1ZSBhdCBhbmQgYmVuZWF0aCB3aGljaCB0b1N0cmluZyByZXR1cm5zIGV4cG9uZW50aWFsIG5vdGF0aW9uLlxuICAgICAgICAgICAgLy8gTnVtYmVyIHR5cGU6IC03XG4gICAgICAgICAgICBUT19FWFBfTkVHID0gLTcsICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAgdG8gLU1BWFxuXG4gICAgICAgICAgICAvLyBUaGUgZXhwb25lbnQgdmFsdWUgYXQgYW5kIGFib3ZlIHdoaWNoIHRvU3RyaW5nIHJldHVybnMgZXhwb25lbnRpYWwgbm90YXRpb24uXG4gICAgICAgICAgICAvLyBOdW1iZXIgdHlwZTogMjFcbiAgICAgICAgICAgIFRPX0VYUF9QT1MgPSAyMSwgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMCB0byBNQVhcblxuICAgICAgICAgICAgLy8gUkFOR0UgOiBbTUlOX0VYUCwgTUFYX0VYUF1cblxuICAgICAgICAgICAgLy8gVGhlIG1pbmltdW0gZXhwb25lbnQgdmFsdWUsIGJlbmVhdGggd2hpY2ggdW5kZXJmbG93IHRvIHplcm8gb2NjdXJzLlxuICAgICAgICAgICAgLy8gTnVtYmVyIHR5cGU6IC0zMjQgICg1ZS0zMjQpXG4gICAgICAgICAgICBNSU5fRVhQID0gLTFlNywgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0xIHRvIC1NQVhcblxuICAgICAgICAgICAgLy8gVGhlIG1heGltdW0gZXhwb25lbnQgdmFsdWUsIGFib3ZlIHdoaWNoIG92ZXJmbG93IHRvIEluZmluaXR5IG9jY3Vycy5cbiAgICAgICAgICAgIC8vIE51bWJlciB0eXBlOiAgMzA4ICAoMS43OTc2OTMxMzQ4NjIzMTU3ZSszMDgpXG4gICAgICAgICAgICAvLyBGb3IgTUFYX0VYUCA+IDFlNywgZS5nLiBuZXcgQmlnTnVtYmVyKCcxZTEwMDAwMDAwMCcpLnBsdXMoMSkgbWF5IGJlIHNsb3cuXG4gICAgICAgICAgICBNQVhfRVhQID0gMWU3LCAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDEgdG8gTUFYXG5cbiAgICAgICAgICAgIC8vIFdoZXRoZXIgQmlnTnVtYmVyIEVycm9ycyBhcmUgZXZlciB0aHJvd24uXG4gICAgICAgICAgICBFUlJPUlMgPSB0cnVlLCAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRydWUgb3IgZmFsc2VcblxuICAgICAgICAgICAgLy8gQ2hhbmdlIHRvIGludFZhbGlkYXRvck5vRXJyb3JzIGlmIEVSUk9SUyBpcyBmYWxzZS5cbiAgICAgICAgICAgIGlzVmFsaWRJbnQgPSBpbnRWYWxpZGF0b3JXaXRoRXJyb3JzLCAgICAgLy8gaW50VmFsaWRhdG9yV2l0aEVycm9ycy9pbnRWYWxpZGF0b3JOb0Vycm9yc1xuXG4gICAgICAgICAgICAvLyBXaGV0aGVyIHRvIHVzZSBjcnlwdG9ncmFwaGljYWxseS1zZWN1cmUgcmFuZG9tIG51bWJlciBnZW5lcmF0aW9uLCBpZiBhdmFpbGFibGUuXG4gICAgICAgICAgICBDUllQVE8gPSBmYWxzZSwgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRydWUgb3IgZmFsc2VcblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAqIFRoZSBtb2R1bG8gbW9kZSB1c2VkIHdoZW4gY2FsY3VsYXRpbmcgdGhlIG1vZHVsdXM6IGEgbW9kIG4uXG4gICAgICAgICAgICAgKiBUaGUgcXVvdGllbnQgKHEgPSBhIC8gbikgaXMgY2FsY3VsYXRlZCBhY2NvcmRpbmcgdG8gdGhlIGNvcnJlc3BvbmRpbmcgcm91bmRpbmcgbW9kZS5cbiAgICAgICAgICAgICAqIFRoZSByZW1haW5kZXIgKHIpIGlzIGNhbGN1bGF0ZWQgYXM6IHIgPSBhIC0gbiAqIHEuXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogVVAgICAgICAgIDAgVGhlIHJlbWFpbmRlciBpcyBwb3NpdGl2ZSBpZiB0aGUgZGl2aWRlbmQgaXMgbmVnYXRpdmUsIGVsc2UgaXMgbmVnYXRpdmUuXG4gICAgICAgICAgICAgKiBET1dOICAgICAgMSBUaGUgcmVtYWluZGVyIGhhcyB0aGUgc2FtZSBzaWduIGFzIHRoZSBkaXZpZGVuZC5cbiAgICAgICAgICAgICAqICAgICAgICAgICAgIFRoaXMgbW9kdWxvIG1vZGUgaXMgY29tbW9ubHkga25vd24gYXMgJ3RydW5jYXRlZCBkaXZpc2lvbicgYW5kIGlzXG4gICAgICAgICAgICAgKiAgICAgICAgICAgICBlcXVpdmFsZW50IHRvIChhICUgbikgaW4gSmF2YVNjcmlwdC5cbiAgICAgICAgICAgICAqIEZMT09SICAgICAzIFRoZSByZW1haW5kZXIgaGFzIHRoZSBzYW1lIHNpZ24gYXMgdGhlIGRpdmlzb3IgKFB5dGhvbiAlKS5cbiAgICAgICAgICAgICAqIEhBTEZfRVZFTiA2IFRoaXMgbW9kdWxvIG1vZGUgaW1wbGVtZW50cyB0aGUgSUVFRSA3NTQgcmVtYWluZGVyIGZ1bmN0aW9uLlxuICAgICAgICAgICAgICogRVVDTElEICAgIDkgRXVjbGlkaWFuIGRpdmlzaW9uLiBxID0gc2lnbihuKSAqIGZsb29yKGEgLyBhYnMobikpLlxuICAgICAgICAgICAgICogICAgICAgICAgICAgVGhlIHJlbWFpbmRlciBpcyBhbHdheXMgcG9zaXRpdmUuXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogVGhlIHRydW5jYXRlZCBkaXZpc2lvbiwgZmxvb3JlZCBkaXZpc2lvbiwgRXVjbGlkaWFuIGRpdmlzaW9uIGFuZCBJRUVFIDc1NCByZW1haW5kZXJcbiAgICAgICAgICAgICAqIG1vZGVzIGFyZSBjb21tb25seSB1c2VkIGZvciB0aGUgbW9kdWx1cyBvcGVyYXRpb24uXG4gICAgICAgICAgICAgKiBBbHRob3VnaCB0aGUgb3RoZXIgcm91bmRpbmcgbW9kZXMgY2FuIGFsc28gYmUgdXNlZCwgdGhleSBtYXkgbm90IGdpdmUgdXNlZnVsIHJlc3VsdHMuXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIE1PRFVMT19NT0RFID0gMSwgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMCB0byA5XG5cbiAgICAgICAgICAgIC8vIFRoZSBtYXhpbXVtIG51bWJlciBvZiBzaWduaWZpY2FudCBkaWdpdHMgb2YgdGhlIHJlc3VsdCBvZiB0aGUgdG9Qb3dlciBvcGVyYXRpb24uXG4gICAgICAgICAgICAvLyBJZiBQT1dfUFJFQ0lTSU9OIGlzIDAsIHRoZXJlIHdpbGwgYmUgdW5saW1pdGVkIHNpZ25pZmljYW50IGRpZ2l0cy5cbiAgICAgICAgICAgIFBPV19QUkVDSVNJT04gPSAxMDAsICAgICAgICAgICAgICAgICAgICAgLy8gMCB0byBNQVhcblxuICAgICAgICAgICAgLy8gVGhlIGZvcm1hdCBzcGVjaWZpY2F0aW9uIHVzZWQgYnkgdGhlIEJpZ051bWJlci5wcm90b3R5cGUudG9Gb3JtYXQgbWV0aG9kLlxuICAgICAgICAgICAgRk9STUFUID0ge1xuICAgICAgICAgICAgICAgIGRlY2ltYWxTZXBhcmF0b3I6ICcuJyxcbiAgICAgICAgICAgICAgICBncm91cFNlcGFyYXRvcjogJywnLFxuICAgICAgICAgICAgICAgIGdyb3VwU2l6ZTogMyxcbiAgICAgICAgICAgICAgICBzZWNvbmRhcnlHcm91cFNpemU6IDAsXG4gICAgICAgICAgICAgICAgZnJhY3Rpb25Hcm91cFNlcGFyYXRvcjogJ1xceEEwJywgICAgICAvLyBub24tYnJlYWtpbmcgc3BhY2VcbiAgICAgICAgICAgICAgICBmcmFjdGlvbkdyb3VwU2l6ZTogMFxuICAgICAgICAgICAgfTtcblxuXG4gICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cblxuICAgICAgICAvLyBDT05TVFJVQ1RPUlxuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogVGhlIEJpZ051bWJlciBjb25zdHJ1Y3RvciBhbmQgZXhwb3J0ZWQgZnVuY3Rpb24uXG4gICAgICAgICAqIENyZWF0ZSBhbmQgcmV0dXJuIGEgbmV3IGluc3RhbmNlIG9mIGEgQmlnTnVtYmVyIG9iamVjdC5cbiAgICAgICAgICpcbiAgICAgICAgICogbiB7bnVtYmVyfHN0cmluZ3xCaWdOdW1iZXJ9IEEgbnVtZXJpYyB2YWx1ZS5cbiAgICAgICAgICogW2JdIHtudW1iZXJ9IFRoZSBiYXNlIG9mIG4uIEludGVnZXIsIDIgdG8gNjQgaW5jbHVzaXZlLlxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gQmlnTnVtYmVyKCBuLCBiICkge1xuICAgICAgICAgICAgdmFyIGMsIGUsIGksIG51bSwgbGVuLCBzdHIsXG4gICAgICAgICAgICAgICAgeCA9IHRoaXM7XG5cbiAgICAgICAgICAgIC8vIEVuYWJsZSBjb25zdHJ1Y3RvciB1c2FnZSB3aXRob3V0IG5ldy5cbiAgICAgICAgICAgIGlmICggISggeCBpbnN0YW5jZW9mIEJpZ051bWJlciApICkge1xuXG4gICAgICAgICAgICAgICAgLy8gJ0JpZ051bWJlcigpIGNvbnN0cnVjdG9yIGNhbGwgd2l0aG91dCBuZXc6IHtufSdcbiAgICAgICAgICAgICAgICBpZiAoRVJST1JTKSByYWlzZSggMjYsICdjb25zdHJ1Y3RvciBjYWxsIHdpdGhvdXQgbmV3JywgbiApO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKCBuLCBiICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vICduZXcgQmlnTnVtYmVyKCkgYmFzZSBub3QgYW4gaW50ZWdlcjoge2J9J1xuICAgICAgICAgICAgLy8gJ25ldyBCaWdOdW1iZXIoKSBiYXNlIG91dCBvZiByYW5nZToge2J9J1xuICAgICAgICAgICAgaWYgKCBiID09IG51bGwgfHwgIWlzVmFsaWRJbnQoIGIsIDIsIDY0LCBpZCwgJ2Jhc2UnICkgKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBEdXBsaWNhdGUuXG4gICAgICAgICAgICAgICAgaWYgKCBuIGluc3RhbmNlb2YgQmlnTnVtYmVyICkge1xuICAgICAgICAgICAgICAgICAgICB4LnMgPSBuLnM7XG4gICAgICAgICAgICAgICAgICAgIHguZSA9IG4uZTtcbiAgICAgICAgICAgICAgICAgICAgeC5jID0gKCBuID0gbi5jICkgPyBuLnNsaWNlKCkgOiBuO1xuICAgICAgICAgICAgICAgICAgICBpZCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoICggbnVtID0gdHlwZW9mIG4gPT0gJ251bWJlcicgKSAmJiBuICogMCA9PSAwICkge1xuICAgICAgICAgICAgICAgICAgICB4LnMgPSAxIC8gbiA8IDAgPyAoIG4gPSAtbiwgLTEgKSA6IDE7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRmFzdCBwYXRoIGZvciBpbnRlZ2Vycy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBuID09PSB+fm4gKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCBlID0gMCwgaSA9IG47IGkgPj0gMTA7IGkgLz0gMTAsIGUrKyApO1xuICAgICAgICAgICAgICAgICAgICAgICAgeC5lID0gZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHguYyA9IFtuXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHN0ciA9IG4gKyAnJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoICFpc051bWVyaWMudGVzdCggc3RyID0gbiArICcnICkgKSByZXR1cm4gcGFyc2VOdW1lcmljKCB4LCBzdHIsIG51bSApO1xuICAgICAgICAgICAgICAgICAgICB4LnMgPSBzdHIuY2hhckNvZGVBdCgwKSA9PT0gNDUgPyAoIHN0ciA9IHN0ci5zbGljZSgxKSwgLTEgKSA6IDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBiID0gYiB8IDA7XG4gICAgICAgICAgICAgICAgc3RyID0gbiArICcnO1xuXG4gICAgICAgICAgICAgICAgLy8gRW5zdXJlIHJldHVybiB2YWx1ZSBpcyByb3VuZGVkIHRvIERFQ0lNQUxfUExBQ0VTIGFzIHdpdGggb3RoZXIgYmFzZXMuXG4gICAgICAgICAgICAgICAgLy8gQWxsb3cgZXhwb25lbnRpYWwgbm90YXRpb24gdG8gYmUgdXNlZCB3aXRoIGJhc2UgMTAgYXJndW1lbnQuXG4gICAgICAgICAgICAgICAgaWYgKCBiID09IDEwICkge1xuICAgICAgICAgICAgICAgICAgICB4ID0gbmV3IEJpZ051bWJlciggbiBpbnN0YW5jZW9mIEJpZ051bWJlciA/IG4gOiBzdHIgKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJvdW5kKCB4LCBERUNJTUFMX1BMQUNFUyArIHguZSArIDEsIFJPVU5ESU5HX01PREUgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBdm9pZCBwb3RlbnRpYWwgaW50ZXJwcmV0YXRpb24gb2YgSW5maW5pdHkgYW5kIE5hTiBhcyBiYXNlIDQ0KyB2YWx1ZXMuXG4gICAgICAgICAgICAgICAgLy8gQW55IG51bWJlciBpbiBleHBvbmVudGlhbCBmb3JtIHdpbGwgZmFpbCBkdWUgdG8gdGhlIFtFZV1bKy1dLlxuICAgICAgICAgICAgICAgIGlmICggKCBudW0gPSB0eXBlb2YgbiA9PSAnbnVtYmVyJyApICYmIG4gKiAwICE9IDAgfHxcbiAgICAgICAgICAgICAgICAgICEoIG5ldyBSZWdFeHAoICdeLT8nICsgKCBjID0gJ1snICsgQUxQSEFCRVQuc2xpY2UoIDAsIGIgKSArICddKycgKSArXG4gICAgICAgICAgICAgICAgICAgICcoPzpcXFxcLicgKyBjICsgJyk/JCcsYiA8IDM3ID8gJ2knIDogJycgKSApLnRlc3Qoc3RyKSApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlTnVtZXJpYyggeCwgc3RyLCBudW0sIGIgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobnVtKSB7XG4gICAgICAgICAgICAgICAgICAgIHgucyA9IDEgLyBuIDwgMCA/ICggc3RyID0gc3RyLnNsaWNlKDEpLCAtMSApIDogMTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIEVSUk9SUyAmJiBzdHIucmVwbGFjZSggL14wXFwuMCp8XFwuLywgJycgKS5sZW5ndGggPiAxNSApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gJ25ldyBCaWdOdW1iZXIoKSBudW1iZXIgdHlwZSBoYXMgbW9yZSB0aGFuIDE1IHNpZ25pZmljYW50IGRpZ2l0czoge259J1xuICAgICAgICAgICAgICAgICAgICAgICAgcmFpc2UoIGlkLCB0b29NYW55RGlnaXRzLCBuICk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBQcmV2ZW50IGxhdGVyIGNoZWNrIGZvciBsZW5ndGggb24gY29udmVydGVkIG51bWJlci5cbiAgICAgICAgICAgICAgICAgICAgbnVtID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgeC5zID0gc3RyLmNoYXJDb2RlQXQoMCkgPT09IDQ1ID8gKCBzdHIgPSBzdHIuc2xpY2UoMSksIC0xICkgOiAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN0ciA9IGNvbnZlcnRCYXNlKCBzdHIsIDEwLCBiLCB4LnMgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRGVjaW1hbCBwb2ludD9cbiAgICAgICAgICAgIGlmICggKCBlID0gc3RyLmluZGV4T2YoJy4nKSApID4gLTEgKSBzdHIgPSBzdHIucmVwbGFjZSggJy4nLCAnJyApO1xuXG4gICAgICAgICAgICAvLyBFeHBvbmVudGlhbCBmb3JtP1xuICAgICAgICAgICAgaWYgKCAoIGkgPSBzdHIuc2VhcmNoKCAvZS9pICkgKSA+IDAgKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBEZXRlcm1pbmUgZXhwb25lbnQuXG4gICAgICAgICAgICAgICAgaWYgKCBlIDwgMCApIGUgPSBpO1xuICAgICAgICAgICAgICAgIGUgKz0gK3N0ci5zbGljZSggaSArIDEgKTtcbiAgICAgICAgICAgICAgICBzdHIgPSBzdHIuc3Vic3RyaW5nKCAwLCBpICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBlIDwgMCApIHtcblxuICAgICAgICAgICAgICAgIC8vIEludGVnZXIuXG4gICAgICAgICAgICAgICAgZSA9IHN0ci5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERldGVybWluZSBsZWFkaW5nIHplcm9zLlxuICAgICAgICAgICAgZm9yICggaSA9IDA7IHN0ci5jaGFyQ29kZUF0KGkpID09PSA0ODsgaSsrICk7XG5cbiAgICAgICAgICAgIC8vIERldGVybWluZSB0cmFpbGluZyB6ZXJvcy5cbiAgICAgICAgICAgIGZvciAoIGxlbiA9IHN0ci5sZW5ndGg7IHN0ci5jaGFyQ29kZUF0KC0tbGVuKSA9PT0gNDg7ICk7XG4gICAgICAgICAgICBzdHIgPSBzdHIuc2xpY2UoIGksIGxlbiArIDEgKTtcblxuICAgICAgICAgICAgaWYgKHN0cikge1xuICAgICAgICAgICAgICAgIGxlbiA9IHN0ci5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAvLyBEaXNhbGxvdyBudW1iZXJzIHdpdGggb3ZlciAxNSBzaWduaWZpY2FudCBkaWdpdHMgaWYgbnVtYmVyIHR5cGUuXG4gICAgICAgICAgICAgICAgLy8gJ25ldyBCaWdOdW1iZXIoKSBudW1iZXIgdHlwZSBoYXMgbW9yZSB0aGFuIDE1IHNpZ25pZmljYW50IGRpZ2l0czoge259J1xuICAgICAgICAgICAgICAgIGlmICggbnVtICYmIEVSUk9SUyAmJiBsZW4gPiAxNSApIHJhaXNlKCBpZCwgdG9vTWFueURpZ2l0cywgeC5zICogbiApO1xuXG4gICAgICAgICAgICAgICAgZSA9IGUgLSBpIC0gMTtcblxuICAgICAgICAgICAgICAgICAvLyBPdmVyZmxvdz9cbiAgICAgICAgICAgICAgICBpZiAoIGUgPiBNQVhfRVhQICkge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEluZmluaXR5LlxuICAgICAgICAgICAgICAgICAgICB4LmMgPSB4LmUgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgLy8gVW5kZXJmbG93P1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIGUgPCBNSU5fRVhQICkge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFplcm8uXG4gICAgICAgICAgICAgICAgICAgIHguYyA9IFsgeC5lID0gMCBdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHguZSA9IGU7XG4gICAgICAgICAgICAgICAgICAgIHguYyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRyYW5zZm9ybSBiYXNlXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gZSBpcyB0aGUgYmFzZSAxMCBleHBvbmVudC5cbiAgICAgICAgICAgICAgICAgICAgLy8gaSBpcyB3aGVyZSB0byBzbGljZSBzdHIgdG8gZ2V0IHRoZSBmaXJzdCBlbGVtZW50IG9mIHRoZSBjb2VmZmljaWVudCBhcnJheS5cbiAgICAgICAgICAgICAgICAgICAgaSA9ICggZSArIDEgKSAlIExPR19CQVNFO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIGUgPCAwICkgaSArPSBMT0dfQkFTRTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIGkgPCBsZW4gKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaSkgeC5jLnB1c2goICtzdHIuc2xpY2UoIDAsIGkgKSApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCBsZW4gLT0gTE9HX0JBU0U7IGkgPCBsZW47ICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHguYy5wdXNoKCArc3RyLnNsaWNlKCBpLCBpICs9IExPR19CQVNFICkgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyID0gc3RyLnNsaWNlKGkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaSA9IExPR19CQVNFIC0gc3RyLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGkgLT0gbGVuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggOyBpLS07IHN0ciArPSAnMCcgKTtcbiAgICAgICAgICAgICAgICAgICAgeC5jLnB1c2goICtzdHIgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgLy8gWmVyby5cbiAgICAgICAgICAgICAgICB4LmMgPSBbIHguZSA9IDAgXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWQgPSAwO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBDT05TVFJVQ1RPUiBQUk9QRVJUSUVTXG5cblxuICAgICAgICBCaWdOdW1iZXIuYW5vdGhlciA9IGFub3RoZXI7XG5cbiAgICAgICAgQmlnTnVtYmVyLlJPVU5EX1VQID0gMDtcbiAgICAgICAgQmlnTnVtYmVyLlJPVU5EX0RPV04gPSAxO1xuICAgICAgICBCaWdOdW1iZXIuUk9VTkRfQ0VJTCA9IDI7XG4gICAgICAgIEJpZ051bWJlci5ST1VORF9GTE9PUiA9IDM7XG4gICAgICAgIEJpZ051bWJlci5ST1VORF9IQUxGX1VQID0gNDtcbiAgICAgICAgQmlnTnVtYmVyLlJPVU5EX0hBTEZfRE9XTiA9IDU7XG4gICAgICAgIEJpZ051bWJlci5ST1VORF9IQUxGX0VWRU4gPSA2O1xuICAgICAgICBCaWdOdW1iZXIuUk9VTkRfSEFMRl9DRUlMID0gNztcbiAgICAgICAgQmlnTnVtYmVyLlJPVU5EX0hBTEZfRkxPT1IgPSA4O1xuICAgICAgICBCaWdOdW1iZXIuRVVDTElEID0gOTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIENvbmZpZ3VyZSBpbmZyZXF1ZW50bHktY2hhbmdpbmcgbGlicmFyeS13aWRlIHNldHRpbmdzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBBY2NlcHQgYW4gb2JqZWN0IG9yIGFuIGFyZ3VtZW50IGxpc3QsIHdpdGggb25lIG9yIG1hbnkgb2YgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzIG9yXG4gICAgICAgICAqIHBhcmFtZXRlcnMgcmVzcGVjdGl2ZWx5OlxuICAgICAgICAgKlxuICAgICAgICAgKiAgIERFQ0lNQUxfUExBQ0VTICB7bnVtYmVyfSAgSW50ZWdlciwgMCB0byBNQVggaW5jbHVzaXZlXG4gICAgICAgICAqICAgUk9VTkRJTkdfTU9ERSAgIHtudW1iZXJ9ICBJbnRlZ2VyLCAwIHRvIDggaW5jbHVzaXZlXG4gICAgICAgICAqICAgRVhQT05FTlRJQUxfQVQgIHtudW1iZXJ8bnVtYmVyW119ICBJbnRlZ2VyLCAtTUFYIHRvIE1BWCBpbmNsdXNpdmUgb3JcbiAgICAgICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtpbnRlZ2VyIC1NQVggdG8gMCBpbmNsLiwgMCB0byBNQVggaW5jbC5dXG4gICAgICAgICAqICAgUkFOR0UgICAgICAgICAgIHtudW1iZXJ8bnVtYmVyW119ICBOb24temVybyBpbnRlZ2VyLCAtTUFYIHRvIE1BWCBpbmNsdXNpdmUgb3JcbiAgICAgICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtpbnRlZ2VyIC1NQVggdG8gLTEgaW5jbC4sIGludGVnZXIgMSB0byBNQVggaW5jbC5dXG4gICAgICAgICAqICAgRVJST1JTICAgICAgICAgIHtib29sZWFufG51bWJlcn0gICB0cnVlLCBmYWxzZSwgMSBvciAwXG4gICAgICAgICAqICAgQ1JZUFRPICAgICAgICAgIHtib29sZWFufG51bWJlcn0gICB0cnVlLCBmYWxzZSwgMSBvciAwXG4gICAgICAgICAqICAgTU9EVUxPX01PREUgICAgIHtudW1iZXJ9ICAgICAgICAgICAwIHRvIDkgaW5jbHVzaXZlXG4gICAgICAgICAqICAgUE9XX1BSRUNJU0lPTiAgIHtudW1iZXJ9ICAgICAgICAgICAwIHRvIE1BWCBpbmNsdXNpdmVcbiAgICAgICAgICogICBGT1JNQVQgICAgICAgICAge29iamVjdH0gICAgICAgICAgIFNlZSBCaWdOdW1iZXIucHJvdG90eXBlLnRvRm9ybWF0XG4gICAgICAgICAqICAgICAgZGVjaW1hbFNlcGFyYXRvciAgICAgICB7c3RyaW5nfVxuICAgICAgICAgKiAgICAgIGdyb3VwU2VwYXJhdG9yICAgICAgICAge3N0cmluZ31cbiAgICAgICAgICogICAgICBncm91cFNpemUgICAgICAgICAgICAgIHtudW1iZXJ9XG4gICAgICAgICAqICAgICAgc2Vjb25kYXJ5R3JvdXBTaXplICAgICB7bnVtYmVyfVxuICAgICAgICAgKiAgICAgIGZyYWN0aW9uR3JvdXBTZXBhcmF0b3Ige3N0cmluZ31cbiAgICAgICAgICogICAgICBmcmFjdGlvbkdyb3VwU2l6ZSAgICAgIHtudW1iZXJ9XG4gICAgICAgICAqXG4gICAgICAgICAqIChUaGUgdmFsdWVzIGFzc2lnbmVkIHRvIHRoZSBhYm92ZSBGT1JNQVQgb2JqZWN0IHByb3BlcnRpZXMgYXJlIG5vdCBjaGVja2VkIGZvciB2YWxpZGl0eS4pXG4gICAgICAgICAqXG4gICAgICAgICAqIEUuZy5cbiAgICAgICAgICogQmlnTnVtYmVyLmNvbmZpZygyMCwgNCkgaXMgZXF1aXZhbGVudCB0b1xuICAgICAgICAgKiBCaWdOdW1iZXIuY29uZmlnKHsgREVDSU1BTF9QTEFDRVMgOiAyMCwgUk9VTkRJTkdfTU9ERSA6IDQgfSlcbiAgICAgICAgICpcbiAgICAgICAgICogSWdub3JlIHByb3BlcnRpZXMvcGFyYW1ldGVycyBzZXQgdG8gbnVsbCBvciB1bmRlZmluZWQuXG4gICAgICAgICAqIFJldHVybiBhbiBvYmplY3Qgd2l0aCB0aGUgcHJvcGVydGllcyBjdXJyZW50IHZhbHVlcy5cbiAgICAgICAgICovXG4gICAgICAgIEJpZ051bWJlci5jb25maWcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdiwgcCxcbiAgICAgICAgICAgICAgICBpID0gMCxcbiAgICAgICAgICAgICAgICByID0ge30sXG4gICAgICAgICAgICAgICAgYSA9IGFyZ3VtZW50cyxcbiAgICAgICAgICAgICAgICBvID0gYVswXSxcbiAgICAgICAgICAgICAgICBoYXMgPSBvICYmIHR5cGVvZiBvID09ICdvYmplY3QnXG4gICAgICAgICAgICAgICAgICA/IGZ1bmN0aW9uICgpIHsgaWYgKCBvLmhhc093blByb3BlcnR5KHApICkgcmV0dXJuICggdiA9IG9bcF0gKSAhPSBudWxsOyB9XG4gICAgICAgICAgICAgICAgICA6IGZ1bmN0aW9uICgpIHsgaWYgKCBhLmxlbmd0aCA+IGkgKSByZXR1cm4gKCB2ID0gYVtpKytdICkgIT0gbnVsbDsgfTtcblxuICAgICAgICAgICAgLy8gREVDSU1BTF9QTEFDRVMge251bWJlcn0gSW50ZWdlciwgMCB0byBNQVggaW5jbHVzaXZlLlxuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIERFQ0lNQUxfUExBQ0VTIG5vdCBhbiBpbnRlZ2VyOiB7dn0nXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgREVDSU1BTF9QTEFDRVMgb3V0IG9mIHJhbmdlOiB7dn0nXG4gICAgICAgICAgICBpZiAoIGhhcyggcCA9ICdERUNJTUFMX1BMQUNFUycgKSAmJiBpc1ZhbGlkSW50KCB2LCAwLCBNQVgsIDIsIHAgKSApIHtcbiAgICAgICAgICAgICAgICBERUNJTUFMX1BMQUNFUyA9IHYgfCAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IERFQ0lNQUxfUExBQ0VTO1xuXG4gICAgICAgICAgICAvLyBST1VORElOR19NT0RFIHtudW1iZXJ9IEludGVnZXIsIDAgdG8gOCBpbmNsdXNpdmUuXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgUk9VTkRJTkdfTU9ERSBub3QgYW4gaW50ZWdlcjoge3Z9J1xuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIFJPVU5ESU5HX01PREUgb3V0IG9mIHJhbmdlOiB7dn0nXG4gICAgICAgICAgICBpZiAoIGhhcyggcCA9ICdST1VORElOR19NT0RFJyApICYmIGlzVmFsaWRJbnQoIHYsIDAsIDgsIDIsIHAgKSApIHtcbiAgICAgICAgICAgICAgICBST1VORElOR19NT0RFID0gdiB8IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByW3BdID0gUk9VTkRJTkdfTU9ERTtcblxuICAgICAgICAgICAgLy8gRVhQT05FTlRJQUxfQVQge251bWJlcnxudW1iZXJbXX1cbiAgICAgICAgICAgIC8vIEludGVnZXIsIC1NQVggdG8gTUFYIGluY2x1c2l2ZSBvciBbaW50ZWdlciAtTUFYIHRvIDAgaW5jbHVzaXZlLCAwIHRvIE1BWCBpbmNsdXNpdmVdLlxuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIEVYUE9ORU5USUFMX0FUIG5vdCBhbiBpbnRlZ2VyOiB7dn0nXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgRVhQT05FTlRJQUxfQVQgb3V0IG9mIHJhbmdlOiB7dn0nXG4gICAgICAgICAgICBpZiAoIGhhcyggcCA9ICdFWFBPTkVOVElBTF9BVCcgKSApIHtcblxuICAgICAgICAgICAgICAgIGlmICggaXNBcnJheSh2KSApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCBpc1ZhbGlkSW50KCB2WzBdLCAtTUFYLCAwLCAyLCBwICkgJiYgaXNWYWxpZEludCggdlsxXSwgMCwgTUFYLCAyLCBwICkgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBUT19FWFBfTkVHID0gdlswXSB8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBUT19FWFBfUE9TID0gdlsxXSB8IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCBpc1ZhbGlkSW50KCB2LCAtTUFYLCBNQVgsIDIsIHAgKSApIHtcbiAgICAgICAgICAgICAgICAgICAgVE9fRVhQX05FRyA9IC0oIFRPX0VYUF9QT1MgPSAoIHYgPCAwID8gLXYgOiB2ICkgfCAwICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IFsgVE9fRVhQX05FRywgVE9fRVhQX1BPUyBdO1xuXG4gICAgICAgICAgICAvLyBSQU5HRSB7bnVtYmVyfG51bWJlcltdfSBOb24temVybyBpbnRlZ2VyLCAtTUFYIHRvIE1BWCBpbmNsdXNpdmUgb3JcbiAgICAgICAgICAgIC8vIFtpbnRlZ2VyIC1NQVggdG8gLTEgaW5jbHVzaXZlLCBpbnRlZ2VyIDEgdG8gTUFYIGluY2x1c2l2ZV0uXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgUkFOR0Ugbm90IGFuIGludGVnZXI6IHt2fSdcbiAgICAgICAgICAgIC8vICdjb25maWcoKSBSQU5HRSBjYW5ub3QgYmUgemVybzoge3Z9J1xuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIFJBTkdFIG91dCBvZiByYW5nZToge3Z9J1xuICAgICAgICAgICAgaWYgKCBoYXMoIHAgPSAnUkFOR0UnICkgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIGlzQXJyYXkodikgKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICggaXNWYWxpZEludCggdlswXSwgLU1BWCwgLTEsIDIsIHAgKSAmJiBpc1ZhbGlkSW50KCB2WzFdLCAxLCBNQVgsIDIsIHAgKSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIE1JTl9FWFAgPSB2WzBdIHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIE1BWF9FWFAgPSB2WzFdIHwgMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIGlzVmFsaWRJbnQoIHYsIC1NQVgsIE1BWCwgMiwgcCApICkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIHYgfCAwICkgTUlOX0VYUCA9IC0oIE1BWF9FWFAgPSAoIHYgPCAwID8gLXYgOiB2ICkgfCAwICk7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKEVSUk9SUykgcmFpc2UoIDIsIHAgKyAnIGNhbm5vdCBiZSB6ZXJvJywgdiApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJbcF0gPSBbIE1JTl9FWFAsIE1BWF9FWFAgXTtcblxuICAgICAgICAgICAgLy8gRVJST1JTIHtib29sZWFufG51bWJlcn0gdHJ1ZSwgZmFsc2UsIDEgb3IgMC5cbiAgICAgICAgICAgIC8vICdjb25maWcoKSBFUlJPUlMgbm90IGEgYm9vbGVhbiBvciBiaW5hcnkgZGlnaXQ6IHt2fSdcbiAgICAgICAgICAgIGlmICggaGFzKCBwID0gJ0VSUk9SUycgKSApIHtcblxuICAgICAgICAgICAgICAgIGlmICggdiA9PT0gISF2IHx8IHYgPT09IDEgfHwgdiA9PT0gMCApIHtcbiAgICAgICAgICAgICAgICAgICAgaWQgPSAwO1xuICAgICAgICAgICAgICAgICAgICBpc1ZhbGlkSW50ID0gKCBFUlJPUlMgPSAhIXYgKSA/IGludFZhbGlkYXRvcldpdGhFcnJvcnMgOiBpbnRWYWxpZGF0b3JOb0Vycm9ycztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKEVSUk9SUykge1xuICAgICAgICAgICAgICAgICAgICByYWlzZSggMiwgcCArIG5vdEJvb2wsIHYgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByW3BdID0gRVJST1JTO1xuXG4gICAgICAgICAgICAvLyBDUllQVE8ge2Jvb2xlYW58bnVtYmVyfSB0cnVlLCBmYWxzZSwgMSBvciAwLlxuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIENSWVBUTyBub3QgYSBib29sZWFuIG9yIGJpbmFyeSBkaWdpdDoge3Z9J1xuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIGNyeXB0byB1bmF2YWlsYWJsZToge2NyeXB0b30nXG4gICAgICAgICAgICBpZiAoIGhhcyggcCA9ICdDUllQVE8nICkgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIHYgPT09ICEhdiB8fCB2ID09PSAxIHx8IHYgPT09IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIENSWVBUTyA9ICEhKCB2ICYmIGNyeXB0byAmJiB0eXBlb2YgY3J5cHRvID09ICdvYmplY3QnICk7XG4gICAgICAgICAgICAgICAgICAgIGlmICggdiAmJiAhQ1JZUFRPICYmIEVSUk9SUyApIHJhaXNlKCAyLCAnY3J5cHRvIHVuYXZhaWxhYmxlJywgY3J5cHRvICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChFUlJPUlMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFpc2UoIDIsIHAgKyBub3RCb29sLCB2ICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IENSWVBUTztcblxuICAgICAgICAgICAgLy8gTU9EVUxPX01PREUge251bWJlcn0gSW50ZWdlciwgMCB0byA5IGluY2x1c2l2ZS5cbiAgICAgICAgICAgIC8vICdjb25maWcoKSBNT0RVTE9fTU9ERSBub3QgYW4gaW50ZWdlcjoge3Z9J1xuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIE1PRFVMT19NT0RFIG91dCBvZiByYW5nZToge3Z9J1xuICAgICAgICAgICAgaWYgKCBoYXMoIHAgPSAnTU9EVUxPX01PREUnICkgJiYgaXNWYWxpZEludCggdiwgMCwgOSwgMiwgcCApICkge1xuICAgICAgICAgICAgICAgIE1PRFVMT19NT0RFID0gdiB8IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByW3BdID0gTU9EVUxPX01PREU7XG5cbiAgICAgICAgICAgIC8vIFBPV19QUkVDSVNJT04ge251bWJlcn0gSW50ZWdlciwgMCB0byBNQVggaW5jbHVzaXZlLlxuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIFBPV19QUkVDSVNJT04gbm90IGFuIGludGVnZXI6IHt2fSdcbiAgICAgICAgICAgIC8vICdjb25maWcoKSBQT1dfUFJFQ0lTSU9OIG91dCBvZiByYW5nZToge3Z9J1xuICAgICAgICAgICAgaWYgKCBoYXMoIHAgPSAnUE9XX1BSRUNJU0lPTicgKSAmJiBpc1ZhbGlkSW50KCB2LCAwLCBNQVgsIDIsIHAgKSApIHtcbiAgICAgICAgICAgICAgICBQT1dfUFJFQ0lTSU9OID0gdiB8IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByW3BdID0gUE9XX1BSRUNJU0lPTjtcblxuICAgICAgICAgICAgLy8gRk9STUFUIHtvYmplY3R9XG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgRk9STUFUIG5vdCBhbiBvYmplY3Q6IHt2fSdcbiAgICAgICAgICAgIGlmICggaGFzKCBwID0gJ0ZPUk1BVCcgKSApIHtcblxuICAgICAgICAgICAgICAgIGlmICggdHlwZW9mIHYgPT0gJ29iamVjdCcgKSB7XG4gICAgICAgICAgICAgICAgICAgIEZPUk1BVCA9IHY7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChFUlJPUlMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFpc2UoIDIsIHAgKyAnIG5vdCBhbiBvYmplY3QnLCB2ICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IEZPUk1BVDtcblxuICAgICAgICAgICAgcmV0dXJuIHI7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSBtYXhpbXVtIG9mIHRoZSBhcmd1bWVudHMuXG4gICAgICAgICAqXG4gICAgICAgICAqIGFyZ3VtZW50cyB7bnVtYmVyfHN0cmluZ3xCaWdOdW1iZXJ9XG4gICAgICAgICAqL1xuICAgICAgICBCaWdOdW1iZXIubWF4ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gbWF4T3JNaW4oIGFyZ3VtZW50cywgUC5sdCApOyB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgbWluaW11bSBvZiB0aGUgYXJndW1lbnRzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBhcmd1bWVudHMge251bWJlcnxzdHJpbmd8QmlnTnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgQmlnTnVtYmVyLm1pbiA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1heE9yTWluKCBhcmd1bWVudHMsIFAuZ3QgKTsgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2l0aCBhIHJhbmRvbSB2YWx1ZSBlcXVhbCB0byBvciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEsXG4gICAgICAgICAqIGFuZCB3aXRoIGRwLCBvciBERUNJTUFMX1BMQUNFUyBpZiBkcCBpcyBvbWl0dGVkLCBkZWNpbWFsIHBsYWNlcyAob3IgbGVzcyBpZiB0cmFpbGluZ1xuICAgICAgICAgKiB6ZXJvcyBhcmUgcHJvZHVjZWQpLlxuICAgICAgICAgKlxuICAgICAgICAgKiBbZHBdIHtudW1iZXJ9IERlY2ltYWwgcGxhY2VzLiBJbnRlZ2VyLCAwIHRvIE1BWCBpbmNsdXNpdmUuXG4gICAgICAgICAqXG4gICAgICAgICAqICdyYW5kb20oKSBkZWNpbWFsIHBsYWNlcyBub3QgYW4gaW50ZWdlcjoge2RwfSdcbiAgICAgICAgICogJ3JhbmRvbSgpIGRlY2ltYWwgcGxhY2VzIG91dCBvZiByYW5nZToge2RwfSdcbiAgICAgICAgICogJ3JhbmRvbSgpIGNyeXB0byB1bmF2YWlsYWJsZToge2NyeXB0b30nXG4gICAgICAgICAqL1xuICAgICAgICBCaWdOdW1iZXIucmFuZG9tID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBwb3cyXzUzID0gMHgyMDAwMDAwMDAwMDAwMDtcblxuICAgICAgICAgICAgLy8gUmV0dXJuIGEgNTMgYml0IGludGVnZXIgbiwgd2hlcmUgMCA8PSBuIDwgOTAwNzE5OTI1NDc0MDk5Mi5cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIE1hdGgucmFuZG9tKCkgcHJvZHVjZXMgbW9yZSB0aGFuIDMyIGJpdHMgb2YgcmFuZG9tbmVzcy5cbiAgICAgICAgICAgIC8vIElmIGl0IGRvZXMsIGFzc3VtZSBhdCBsZWFzdCA1MyBiaXRzIGFyZSBwcm9kdWNlZCwgb3RoZXJ3aXNlIGFzc3VtZSBhdCBsZWFzdCAzMCBiaXRzLlxuICAgICAgICAgICAgLy8gMHg0MDAwMDAwMCBpcyAyXjMwLCAweDgwMDAwMCBpcyAyXjIzLCAweDFmZmZmZiBpcyAyXjIxIC0gMS5cbiAgICAgICAgICAgIHZhciByYW5kb201M2JpdEludCA9IChNYXRoLnJhbmRvbSgpICogcG93Ml81MykgJiAweDFmZmZmZlxuICAgICAgICAgICAgICA/IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1hdGhmbG9vciggTWF0aC5yYW5kb20oKSAqIHBvdzJfNTMgKTsgfVxuICAgICAgICAgICAgICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICgoTWF0aC5yYW5kb20oKSAqIDB4NDAwMDAwMDAgfCAwKSAqIDB4ODAwMDAwKSArXG4gICAgICAgICAgICAgICAgICAoTWF0aC5yYW5kb20oKSAqIDB4ODAwMDAwIHwgMCk7IH07XG5cbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoZHApIHtcbiAgICAgICAgICAgICAgICB2YXIgYSwgYiwgZSwgaywgdixcbiAgICAgICAgICAgICAgICAgICAgaSA9IDAsXG4gICAgICAgICAgICAgICAgICAgIGMgPSBbXSxcbiAgICAgICAgICAgICAgICAgICAgcmFuZCA9IG5ldyBCaWdOdW1iZXIoT05FKTtcblxuICAgICAgICAgICAgICAgIGRwID0gZHAgPT0gbnVsbCB8fCAhaXNWYWxpZEludCggZHAsIDAsIE1BWCwgMTQgKSA/IERFQ0lNQUxfUExBQ0VTIDogZHAgfCAwO1xuICAgICAgICAgICAgICAgIGsgPSBtYXRoY2VpbCggZHAgLyBMT0dfQkFTRSApO1xuXG4gICAgICAgICAgICAgICAgaWYgKENSWVBUTykge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEJyb3dzZXJzIHN1cHBvcnRpbmcgY3J5cHRvLmdldFJhbmRvbVZhbHVlcy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBjcnlwdG8gJiYgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYSA9IGNyeXB0by5nZXRSYW5kb21WYWx1ZXMoIG5ldyBVaW50MzJBcnJheSggayAqPSAyICkgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICggOyBpIDwgazsgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyA1MyBiaXRzOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICgoTWF0aC5wb3coMiwgMzIpIC0gMSkgKiBNYXRoLnBvdygyLCAyMSkpLnRvU3RyaW5nKDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMTExMTEgMTExMTExMTEgMTExMTExMTEgMTExMTExMTEgMTExMDAwMDAgMDAwMDAwMDAgMDAwMDAwMDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAoKE1hdGgucG93KDIsIDMyKSAtIDEpID4+PiAxMSkudG9TdHJpbmcoMilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAxMTExMSAxMTExMTExMSAxMTExMTExMVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDB4MjAwMDAgaXMgMl4yMS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ID0gYVtpXSAqIDB4MjAwMDAgKyAoYVtpICsgMV0gPj4+IDExKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlamVjdGlvbiBzYW1wbGluZzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwIDw9IHYgPCA5MDA3MTk5MjU0NzQwOTkyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUHJvYmFiaWxpdHkgdGhhdCB2ID49IDllMTUsIGlzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gNzE5OTI1NDc0MDk5MiAvIDkwMDcxOTkyNTQ3NDA5OTIgfj0gMC4wMDA4LCBpLmUuIDEgaW4gMTI1MVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggdiA+PSA5ZTE1ICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiID0gY3J5cHRvLmdldFJhbmRvbVZhbHVlcyggbmV3IFVpbnQzMkFycmF5KDIpICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFbaV0gPSBiWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhW2kgKyAxXSA9IGJbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwIDw9IHYgPD0gODk5OTk5OTk5OTk5OTk5OVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwIDw9ICh2ICUgMWUxNCkgPD0gOTk5OTk5OTk5OTk5OTlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYy5wdXNoKCB2ICUgMWUxNCApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpICs9IDI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaSA9IGsgLyAyO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIE5vZGUuanMgc3VwcG9ydGluZyBjcnlwdG8ucmFuZG9tQnl0ZXMuXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIGNyeXB0byAmJiBjcnlwdG8ucmFuZG9tQnl0ZXMgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJ1ZmZlclxuICAgICAgICAgICAgICAgICAgICAgICAgYSA9IGNyeXB0by5yYW5kb21CeXRlcyggayAqPSA3ICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoIDsgaSA8IGs7ICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMHgxMDAwMDAwMDAwMDAwIGlzIDJeNDgsIDB4MTAwMDAwMDAwMDAgaXMgMl40MFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDB4MTAwMDAwMDAwIGlzIDJeMzIsIDB4MTAwMDAwMCBpcyAyXjI0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMTExMTEgMTExMTExMTEgMTExMTExMTEgMTExMTExMTEgMTExMTExMTEgMTExMTExMTEgMTExMTExMTFcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwIDw9IHYgPCA5MDA3MTk5MjU0NzQwOTkyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdiA9ICggKCBhW2ldICYgMzEgKSAqIDB4MTAwMDAwMDAwMDAwMCApICsgKCBhW2kgKyAxXSAqIDB4MTAwMDAwMDAwMDAgKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKCBhW2kgKyAyXSAqIDB4MTAwMDAwMDAwICkgKyAoIGFbaSArIDNdICogMHgxMDAwMDAwICkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICggYVtpICsgNF0gPDwgMTYgKSArICggYVtpICsgNV0gPDwgOCApICsgYVtpICsgNl07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHYgPj0gOWUxNSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3J5cHRvLnJhbmRvbUJ5dGVzKDcpLmNvcHkoIGEsIGkgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAgPD0gKHYgJSAxZTE0KSA8PSA5OTk5OTk5OTk5OTk5OVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjLnB1c2goIHYgJSAxZTE0ICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGkgKz0gNztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpID0gayAvIDc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoRVJST1JTKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByYWlzZSggMTQsICdjcnlwdG8gdW5hdmFpbGFibGUnLCBjcnlwdG8gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFVzZSBNYXRoLnJhbmRvbTogQ1JZUFRPIGlzIGZhbHNlIG9yIGNyeXB0byBpcyB1bmF2YWlsYWJsZSBhbmQgRVJST1JTIGlzIGZhbHNlLlxuICAgICAgICAgICAgICAgIGlmICghaSkge1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIDsgaSA8IGs7ICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdiA9IHJhbmRvbTUzYml0SW50KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHYgPCA5ZTE1ICkgY1tpKytdID0gdiAlIDFlMTQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBrID0gY1stLWldO1xuICAgICAgICAgICAgICAgIGRwICU9IExPR19CQVNFO1xuXG4gICAgICAgICAgICAgICAgLy8gQ29udmVydCB0cmFpbGluZyBkaWdpdHMgdG8gemVyb3MgYWNjb3JkaW5nIHRvIGRwLlxuICAgICAgICAgICAgICAgIGlmICggayAmJiBkcCApIHtcbiAgICAgICAgICAgICAgICAgICAgdiA9IFBPV1NfVEVOW0xPR19CQVNFIC0gZHBdO1xuICAgICAgICAgICAgICAgICAgICBjW2ldID0gbWF0aGZsb29yKCBrIC8gdiApICogdjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgdHJhaWxpbmcgZWxlbWVudHMgd2hpY2ggYXJlIHplcm8uXG4gICAgICAgICAgICAgICAgZm9yICggOyBjW2ldID09PSAwOyBjLnBvcCgpLCBpLS0gKTtcblxuICAgICAgICAgICAgICAgIC8vIFplcm8/XG4gICAgICAgICAgICAgICAgaWYgKCBpIDwgMCApIHtcbiAgICAgICAgICAgICAgICAgICAgYyA9IFsgZSA9IDAgXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIGVsZW1lbnRzIHdoaWNoIGFyZSB6ZXJvIGFuZCBhZGp1c3QgZXhwb25lbnQgYWNjb3JkaW5nbHkuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIGUgPSAtMSA7IGNbMF0gPT09IDA7IGMuc2hpZnQoKSwgZSAtPSBMT0dfQkFTRSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ291bnQgdGhlIGRpZ2l0cyBvZiB0aGUgZmlyc3QgZWxlbWVudCBvZiBjIHRvIGRldGVybWluZSBsZWFkaW5nIHplcm9zLCBhbmQuLi5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggaSA9IDEsIHYgPSBjWzBdOyB2ID49IDEwOyB2IC89IDEwLCBpKyspO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGFkanVzdCB0aGUgZXhwb25lbnQgYWNjb3JkaW5nbHkuXG4gICAgICAgICAgICAgICAgICAgIGlmICggaSA8IExPR19CQVNFICkgZSAtPSBMT0dfQkFTRSAtIGk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmFuZC5lID0gZTtcbiAgICAgICAgICAgICAgICByYW5kLmMgPSBjO1xuICAgICAgICAgICAgICAgIHJldHVybiByYW5kO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSkoKTtcblxuXG4gICAgICAgIC8vIFBSSVZBVEUgRlVOQ1RJT05TXG5cblxuICAgICAgICAvLyBDb252ZXJ0IGEgbnVtZXJpYyBzdHJpbmcgb2YgYmFzZUluIHRvIGEgbnVtZXJpYyBzdHJpbmcgb2YgYmFzZU91dC5cbiAgICAgICAgZnVuY3Rpb24gY29udmVydEJhc2UoIHN0ciwgYmFzZU91dCwgYmFzZUluLCBzaWduICkge1xuICAgICAgICAgICAgdmFyIGQsIGUsIGssIHIsIHgsIHhjLCB5LFxuICAgICAgICAgICAgICAgIGkgPSBzdHIuaW5kZXhPZiggJy4nICksXG4gICAgICAgICAgICAgICAgZHAgPSBERUNJTUFMX1BMQUNFUyxcbiAgICAgICAgICAgICAgICBybSA9IFJPVU5ESU5HX01PREU7XG5cbiAgICAgICAgICAgIGlmICggYmFzZUluIDwgMzcgKSBzdHIgPSBzdHIudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICAgICAgLy8gTm9uLWludGVnZXIuXG4gICAgICAgICAgICBpZiAoIGkgPj0gMCApIHtcbiAgICAgICAgICAgICAgICBrID0gUE9XX1BSRUNJU0lPTjtcblxuICAgICAgICAgICAgICAgIC8vIFVubGltaXRlZCBwcmVjaXNpb24uXG4gICAgICAgICAgICAgICAgUE9XX1BSRUNJU0lPTiA9IDA7XG4gICAgICAgICAgICAgICAgc3RyID0gc3RyLnJlcGxhY2UoICcuJywgJycgKTtcbiAgICAgICAgICAgICAgICB5ID0gbmV3IEJpZ051bWJlcihiYXNlSW4pO1xuICAgICAgICAgICAgICAgIHggPSB5LnBvdyggc3RyLmxlbmd0aCAtIGkgKTtcbiAgICAgICAgICAgICAgICBQT1dfUFJFQ0lTSU9OID0gaztcblxuICAgICAgICAgICAgICAgIC8vIENvbnZlcnQgc3RyIGFzIGlmIGFuIGludGVnZXIsIHRoZW4gcmVzdG9yZSB0aGUgZnJhY3Rpb24gcGFydCBieSBkaXZpZGluZyB0aGVcbiAgICAgICAgICAgICAgICAvLyByZXN1bHQgYnkgaXRzIGJhc2UgcmFpc2VkIHRvIGEgcG93ZXIuXG4gICAgICAgICAgICAgICAgeS5jID0gdG9CYXNlT3V0KCB0b0ZpeGVkUG9pbnQoIGNvZWZmVG9TdHJpbmcoIHguYyApLCB4LmUgKSwgMTAsIGJhc2VPdXQgKTtcbiAgICAgICAgICAgICAgICB5LmUgPSB5LmMubGVuZ3RoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDb252ZXJ0IHRoZSBudW1iZXIgYXMgaW50ZWdlci5cbiAgICAgICAgICAgIHhjID0gdG9CYXNlT3V0KCBzdHIsIGJhc2VJbiwgYmFzZU91dCApO1xuICAgICAgICAgICAgZSA9IGsgPSB4Yy5sZW5ndGg7XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSB0cmFpbGluZyB6ZXJvcy5cbiAgICAgICAgICAgIGZvciAoIDsgeGNbLS1rXSA9PSAwOyB4Yy5wb3AoKSApO1xuICAgICAgICAgICAgaWYgKCAheGNbMF0gKSByZXR1cm4gJzAnO1xuXG4gICAgICAgICAgICBpZiAoIGkgPCAwICkge1xuICAgICAgICAgICAgICAgIC0tZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgeC5jID0geGM7XG4gICAgICAgICAgICAgICAgeC5lID0gZTtcblxuICAgICAgICAgICAgICAgIC8vIHNpZ24gaXMgbmVlZGVkIGZvciBjb3JyZWN0IHJvdW5kaW5nLlxuICAgICAgICAgICAgICAgIHgucyA9IHNpZ247XG4gICAgICAgICAgICAgICAgeCA9IGRpdiggeCwgeSwgZHAsIHJtLCBiYXNlT3V0ICk7XG4gICAgICAgICAgICAgICAgeGMgPSB4LmM7XG4gICAgICAgICAgICAgICAgciA9IHgucjtcbiAgICAgICAgICAgICAgICBlID0geC5lO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkID0gZSArIGRwICsgMTtcblxuICAgICAgICAgICAgLy8gVGhlIHJvdW5kaW5nIGRpZ2l0LCBpLmUuIHRoZSBkaWdpdCB0byB0aGUgcmlnaHQgb2YgdGhlIGRpZ2l0IHRoYXQgbWF5IGJlIHJvdW5kZWQgdXAuXG4gICAgICAgICAgICBpID0geGNbZF07XG4gICAgICAgICAgICBrID0gYmFzZU91dCAvIDI7XG4gICAgICAgICAgICByID0gciB8fCBkIDwgMCB8fCB4Y1tkICsgMV0gIT0gbnVsbDtcblxuICAgICAgICAgICAgciA9IHJtIDwgNCA/ICggaSAhPSBudWxsIHx8IHIgKSAmJiAoIHJtID09IDAgfHwgcm0gPT0gKCB4LnMgPCAwID8gMyA6IDIgKSApXG4gICAgICAgICAgICAgICAgICAgICAgIDogaSA+IGsgfHwgaSA9PSBrICYmKCBybSA9PSA0IHx8IHIgfHwgcm0gPT0gNiAmJiB4Y1tkIC0gMV0gJiAxIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgcm0gPT0gKCB4LnMgPCAwID8gOCA6IDcgKSApO1xuXG4gICAgICAgICAgICBpZiAoIGQgPCAxIHx8ICF4Y1swXSApIHtcblxuICAgICAgICAgICAgICAgIC8vIDFeLWRwIG9yIDAuXG4gICAgICAgICAgICAgICAgc3RyID0gciA/IHRvRml4ZWRQb2ludCggJzEnLCAtZHAgKSA6ICcwJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgeGMubGVuZ3RoID0gZDtcblxuICAgICAgICAgICAgICAgIGlmIChyKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUm91bmRpbmcgdXAgbWF5IG1lYW4gdGhlIHByZXZpb3VzIGRpZ2l0IGhhcyB0byBiZSByb3VuZGVkIHVwIGFuZCBzbyBvbi5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggLS1iYXNlT3V0OyArK3hjWy0tZF0gPiBiYXNlT3V0OyApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHhjW2RdID0gMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCAhZCApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICArK2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeGMudW5zaGlmdCgxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIERldGVybWluZSB0cmFpbGluZyB6ZXJvcy5cbiAgICAgICAgICAgICAgICBmb3IgKCBrID0geGMubGVuZ3RoOyAheGNbLS1rXTsgKTtcblxuICAgICAgICAgICAgICAgIC8vIEUuZy4gWzQsIDExLCAxNV0gYmVjb21lcyA0YmYuXG4gICAgICAgICAgICAgICAgZm9yICggaSA9IDAsIHN0ciA9ICcnOyBpIDw9IGs7IHN0ciArPSBBTFBIQUJFVC5jaGFyQXQoIHhjW2krK10gKSApO1xuICAgICAgICAgICAgICAgIHN0ciA9IHRvRml4ZWRQb2ludCggc3RyLCBlICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRoZSBjYWxsZXIgd2lsbCBhZGQgdGhlIHNpZ24uXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBQZXJmb3JtIGRpdmlzaW9uIGluIHRoZSBzcGVjaWZpZWQgYmFzZS4gQ2FsbGVkIGJ5IGRpdiBhbmQgY29udmVydEJhc2UuXG4gICAgICAgIGRpdiA9IChmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgICAgIC8vIEFzc3VtZSBub24temVybyB4IGFuZCBrLlxuICAgICAgICAgICAgZnVuY3Rpb24gbXVsdGlwbHkoIHgsIGssIGJhc2UgKSB7XG4gICAgICAgICAgICAgICAgdmFyIG0sIHRlbXAsIHhsbywgeGhpLFxuICAgICAgICAgICAgICAgICAgICBjYXJyeSA9IDAsXG4gICAgICAgICAgICAgICAgICAgIGkgPSB4Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAga2xvID0gayAlIFNRUlRfQkFTRSxcbiAgICAgICAgICAgICAgICAgICAga2hpID0gayAvIFNRUlRfQkFTRSB8IDA7XG5cbiAgICAgICAgICAgICAgICBmb3IgKCB4ID0geC5zbGljZSgpOyBpLS07ICkge1xuICAgICAgICAgICAgICAgICAgICB4bG8gPSB4W2ldICUgU1FSVF9CQVNFO1xuICAgICAgICAgICAgICAgICAgICB4aGkgPSB4W2ldIC8gU1FSVF9CQVNFIHwgMDtcbiAgICAgICAgICAgICAgICAgICAgbSA9IGtoaSAqIHhsbyArIHhoaSAqIGtsbztcbiAgICAgICAgICAgICAgICAgICAgdGVtcCA9IGtsbyAqIHhsbyArICggKCBtICUgU1FSVF9CQVNFICkgKiBTUVJUX0JBU0UgKSArIGNhcnJ5O1xuICAgICAgICAgICAgICAgICAgICBjYXJyeSA9ICggdGVtcCAvIGJhc2UgfCAwICkgKyAoIG0gLyBTUVJUX0JBU0UgfCAwICkgKyBraGkgKiB4aGk7XG4gICAgICAgICAgICAgICAgICAgIHhbaV0gPSB0ZW1wICUgYmFzZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FycnkpIHgudW5zaGlmdChjYXJyeSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gY29tcGFyZSggYSwgYiwgYUwsIGJMICkge1xuICAgICAgICAgICAgICAgIHZhciBpLCBjbXA7XG5cbiAgICAgICAgICAgICAgICBpZiAoIGFMICE9IGJMICkge1xuICAgICAgICAgICAgICAgICAgICBjbXAgPSBhTCA+IGJMID8gMSA6IC0xO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggaSA9IGNtcCA9IDA7IGkgPCBhTDsgaSsrICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIGFbaV0gIT0gYltpXSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbXAgPSBhW2ldID4gYltpXSA/IDEgOiAtMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gY21wO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzdWJ0cmFjdCggYSwgYiwgYUwsIGJhc2UgKSB7XG4gICAgICAgICAgICAgICAgdmFyIGkgPSAwO1xuXG4gICAgICAgICAgICAgICAgLy8gU3VidHJhY3QgYiBmcm9tIGEuXG4gICAgICAgICAgICAgICAgZm9yICggOyBhTC0tOyApIHtcbiAgICAgICAgICAgICAgICAgICAgYVthTF0gLT0gaTtcbiAgICAgICAgICAgICAgICAgICAgaSA9IGFbYUxdIDwgYlthTF0gPyAxIDogMDtcbiAgICAgICAgICAgICAgICAgICAgYVthTF0gPSBpICogYmFzZSArIGFbYUxdIC0gYlthTF07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGxlYWRpbmcgemVyb3MuXG4gICAgICAgICAgICAgICAgZm9yICggOyAhYVswXSAmJiBhLmxlbmd0aCA+IDE7IGEuc2hpZnQoKSApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB4OiBkaXZpZGVuZCwgeTogZGl2aXNvci5cbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoIHgsIHksIGRwLCBybSwgYmFzZSApIHtcbiAgICAgICAgICAgICAgICB2YXIgY21wLCBlLCBpLCBtb3JlLCBuLCBwcm9kLCBwcm9kTCwgcSwgcWMsIHJlbSwgcmVtTCwgcmVtMCwgeGksIHhMLCB5YzAsXG4gICAgICAgICAgICAgICAgICAgIHlMLCB5eixcbiAgICAgICAgICAgICAgICAgICAgcyA9IHgucyA9PSB5LnMgPyAxIDogLTEsXG4gICAgICAgICAgICAgICAgICAgIHhjID0geC5jLFxuICAgICAgICAgICAgICAgICAgICB5YyA9IHkuYztcblxuICAgICAgICAgICAgICAgIC8vIEVpdGhlciBOYU4sIEluZmluaXR5IG9yIDA/XG4gICAgICAgICAgICAgICAgaWYgKCAheGMgfHwgIXhjWzBdIHx8ICF5YyB8fCAheWNbMF0gKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBCaWdOdW1iZXIoXG5cbiAgICAgICAgICAgICAgICAgICAgICAvLyBSZXR1cm4gTmFOIGlmIGVpdGhlciBOYU4sIG9yIGJvdGggSW5maW5pdHkgb3IgMC5cbiAgICAgICAgICAgICAgICAgICAgICAheC5zIHx8ICF5LnMgfHwgKCB4YyA/IHljICYmIHhjWzBdID09IHljWzBdIDogIXljICkgPyBOYU4gOlxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBSZXR1cm4gwrEwIGlmIHggaXMgwrEwIG9yIHkgaXMgwrFJbmZpbml0eSwgb3IgcmV0dXJuIMKxSW5maW5pdHkgYXMgeSBpcyDCsTAuXG4gICAgICAgICAgICAgICAgICAgICAgICB4YyAmJiB4Y1swXSA9PSAwIHx8ICF5YyA/IHMgKiAwIDogcyAvIDBcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBxID0gbmV3IEJpZ051bWJlcihzKTtcbiAgICAgICAgICAgICAgICBxYyA9IHEuYyA9IFtdO1xuICAgICAgICAgICAgICAgIGUgPSB4LmUgLSB5LmU7XG4gICAgICAgICAgICAgICAgcyA9IGRwICsgZSArIDE7XG5cbiAgICAgICAgICAgICAgICBpZiAoICFiYXNlICkge1xuICAgICAgICAgICAgICAgICAgICBiYXNlID0gQkFTRTtcbiAgICAgICAgICAgICAgICAgICAgZSA9IGJpdEZsb29yKCB4LmUgLyBMT0dfQkFTRSApIC0gYml0Rmxvb3IoIHkuZSAvIExPR19CQVNFICk7XG4gICAgICAgICAgICAgICAgICAgIHMgPSBzIC8gTE9HX0JBU0UgfCAwO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFJlc3VsdCBleHBvbmVudCBtYXkgYmUgb25lIGxlc3MgdGhlbiB0aGUgY3VycmVudCB2YWx1ZSBvZiBlLlxuICAgICAgICAgICAgICAgIC8vIFRoZSBjb2VmZmljaWVudHMgb2YgdGhlIEJpZ051bWJlcnMgZnJvbSBjb252ZXJ0QmFzZSBtYXkgaGF2ZSB0cmFpbGluZyB6ZXJvcy5cbiAgICAgICAgICAgICAgICBmb3IgKCBpID0gMDsgeWNbaV0gPT0gKCB4Y1tpXSB8fCAwICk7IGkrKyApO1xuICAgICAgICAgICAgICAgIGlmICggeWNbaV0gPiAoIHhjW2ldIHx8IDAgKSApIGUtLTtcblxuICAgICAgICAgICAgICAgIGlmICggcyA8IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHFjLnB1c2goMSk7XG4gICAgICAgICAgICAgICAgICAgIG1vcmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHhMID0geGMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICB5TCA9IHljLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHMgKz0gMjtcblxuICAgICAgICAgICAgICAgICAgICAvLyBOb3JtYWxpc2UgeGMgYW5kIHljIHNvIGhpZ2hlc3Qgb3JkZXIgZGlnaXQgb2YgeWMgaXMgPj0gYmFzZSAvIDIuXG5cbiAgICAgICAgICAgICAgICAgICAgbiA9IG1hdGhmbG9vciggYmFzZSAvICggeWNbMF0gKyAxICkgKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBOb3QgbmVjZXNzYXJ5LCBidXQgdG8gaGFuZGxlIG9kZCBiYXNlcyB3aGVyZSB5Y1swXSA9PSAoIGJhc2UgLyAyICkgLSAxLlxuICAgICAgICAgICAgICAgICAgICAvLyBpZiAoIG4gPiAxIHx8IG4rKyA9PSAxICYmIHljWzBdIDwgYmFzZSAvIDIgKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICggbiA+IDEgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB5YyA9IG11bHRpcGx5KCB5YywgbiwgYmFzZSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgeGMgPSBtdWx0aXBseSggeGMsIG4sIGJhc2UgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHlMID0geWMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgeEwgPSB4Yy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB4aSA9IHlMO1xuICAgICAgICAgICAgICAgICAgICByZW0gPSB4Yy5zbGljZSggMCwgeUwgKTtcbiAgICAgICAgICAgICAgICAgICAgcmVtTCA9IHJlbS5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIHplcm9zIHRvIG1ha2UgcmVtYWluZGVyIGFzIGxvbmcgYXMgZGl2aXNvci5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggOyByZW1MIDwgeUw7IHJlbVtyZW1MKytdID0gMCApO1xuICAgICAgICAgICAgICAgICAgICB5eiA9IHljLnNsaWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHl6LnVuc2hpZnQoMCk7XG4gICAgICAgICAgICAgICAgICAgIHljMCA9IHljWzBdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIHljWzFdID49IGJhc2UgLyAyICkgeWMwKys7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vdCBuZWNlc3NhcnksIGJ1dCB0byBwcmV2ZW50IHRyaWFsIGRpZ2l0IG4gPiBiYXNlLCB3aGVuIHVzaW5nIGJhc2UgMy5cbiAgICAgICAgICAgICAgICAgICAgLy8gZWxzZSBpZiAoIGJhc2UgPT0gMyAmJiB5YzAgPT0gMSApIHljMCA9IDEgKyAxZS0xNTtcblxuICAgICAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuID0gMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29tcGFyZSBkaXZpc29yIGFuZCByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBjbXAgPSBjb21wYXJlKCB5YywgcmVtLCB5TCwgcmVtTCApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBkaXZpc29yIDwgcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBjbXAgPCAwICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIHRyaWFsIGRpZ2l0LCBuLlxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtMCA9IHJlbVswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHlMICE9IHJlbUwgKSByZW0wID0gcmVtMCAqIGJhc2UgKyAoIHJlbVsxXSB8fCAwICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuIGlzIGhvdyBtYW55IHRpbWVzIHRoZSBkaXZpc29yIGdvZXMgaW50byB0aGUgY3VycmVudCByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbiA9IG1hdGhmbG9vciggcmVtMCAvIHljMCApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gIEFsZ29yaXRobTpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgMS4gcHJvZHVjdCA9IGRpdmlzb3IgKiB0cmlhbCBkaWdpdCAobilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgMi4gaWYgcHJvZHVjdCA+IHJlbWFpbmRlcjogcHJvZHVjdCAtPSBkaXZpc29yLCBuLS1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgMy4gcmVtYWluZGVyIC09IHByb2R1Y3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgNC4gaWYgcHJvZHVjdCB3YXMgPCByZW1haW5kZXIgYXQgMjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICA1LiBjb21wYXJlIG5ldyByZW1haW5kZXIgYW5kIGRpdmlzb3JcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICA2LiBJZiByZW1haW5kZXIgPiBkaXZpc29yOiByZW1haW5kZXIgLT0gZGl2aXNvciwgbisrXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIG4gPiAxICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG4gbWF5IGJlID4gYmFzZSBvbmx5IHdoZW4gYmFzZSBpcyAzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobiA+PSBiYXNlKSBuID0gYmFzZSAtIDE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcHJvZHVjdCA9IGRpdmlzb3IgKiB0cmlhbCBkaWdpdC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZCA9IG11bHRpcGx5KCB5YywgbiwgYmFzZSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9kTCA9IHByb2QubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1MID0gcmVtLmxlbmd0aDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBDb21wYXJlIHByb2R1Y3QgYW5kIHJlbWFpbmRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgcHJvZHVjdCA+IHJlbWFpbmRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVHJpYWwgZGlnaXQgbiB0b28gaGlnaC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbiBpcyAxIHRvbyBoaWdoIGFib3V0IDUlIG9mIHRoZSB0aW1lLCBhbmQgaXMgbm90IGtub3duIHRvIGhhdmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZXZlciBiZWVuIG1vcmUgdGhhbiAxIHRvbyBoaWdoLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoIGNvbXBhcmUoIHByb2QsIHJlbSwgcHJvZEwsIHJlbUwgKSA9PSAxICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbi0tO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTdWJ0cmFjdCBkaXZpc29yIGZyb20gcHJvZHVjdC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1YnRyYWN0KCBwcm9kLCB5TCA8IHByb2RMID8geXogOiB5YywgcHJvZEwsIGJhc2UgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2RMID0gcHJvZC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbXAgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuIGlzIDAgb3IgMSwgY21wIGlzIC0xLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBuIGlzIDAsIHRoZXJlIGlzIG5vIG5lZWQgdG8gY29tcGFyZSB5YyBhbmQgcmVtIGFnYWluIGJlbG93LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzbyBjaGFuZ2UgY21wIHRvIDEgdG8gYXZvaWQgaXQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIG4gaXMgMSwgbGVhdmUgY21wIGFzIC0xLCBzbyB5YyBhbmQgcmVtIGFyZSBjb21wYXJlZCBhZ2Fpbi5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBuID09IDAgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGRpdmlzb3IgPCByZW1haW5kZXIsIHNvIG4gbXVzdCBiZSBhdCBsZWFzdCAxLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY21wID0gbiA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBwcm9kdWN0ID0gZGl2aXNvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9kID0geWMuc2xpY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZEwgPSBwcm9kLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHByb2RMIDwgcmVtTCApIHByb2QudW5zaGlmdCgwKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFN1YnRyYWN0IHByb2R1Y3QgZnJvbSByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VidHJhY3QoIHJlbSwgcHJvZCwgcmVtTCwgYmFzZSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbUwgPSByZW0ubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHByb2R1Y3Qgd2FzIDwgcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggY21wID09IC0xICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIENvbXBhcmUgZGl2aXNvciBhbmQgbmV3IHJlbWFpbmRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgZGl2aXNvciA8IG5ldyByZW1haW5kZXIsIHN1YnRyYWN0IGRpdmlzb3IgZnJvbSByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRyaWFsIGRpZ2l0IG4gdG9vIGxvdy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbiBpcyAxIHRvbyBsb3cgYWJvdXQgNSUgb2YgdGhlIHRpbWUsIGFuZCB2ZXJ5IHJhcmVseSAyIHRvbyBsb3cuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdoaWxlICggY29tcGFyZSggeWMsIHJlbSwgeUwsIHJlbUwgKSA8IDEgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuKys7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFN1YnRyYWN0IGRpdmlzb3IgZnJvbSByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJ0cmFjdCggcmVtLCB5TCA8IHJlbUwgPyB5eiA6IHljLCByZW1MLCBiYXNlICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1MID0gcmVtLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIGNtcCA9PT0gMCApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtID0gWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSAvLyBlbHNlIGNtcCA9PT0gMSBhbmQgbiB3aWxsIGJlIDBcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWRkIHRoZSBuZXh0IGRpZ2l0LCBuLCB0byB0aGUgcmVzdWx0IGFycmF5LlxuICAgICAgICAgICAgICAgICAgICAgICAgcWNbaSsrXSA9IG47XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCByZW1bMF0gKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtW3JlbUwrK10gPSB4Y1t4aV0gfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtID0gWyB4Y1t4aV0gXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1MID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSB3aGlsZSAoICggeGkrKyA8IHhMIHx8IHJlbVswXSAhPSBudWxsICkgJiYgcy0tICk7XG5cbiAgICAgICAgICAgICAgICAgICAgbW9yZSA9IHJlbVswXSAhPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIExlYWRpbmcgemVybz9cbiAgICAgICAgICAgICAgICAgICAgaWYgKCAhcWNbMF0gKSBxYy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICggYmFzZSA9PSBCQVNFICkge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRvIGNhbGN1bGF0ZSBxLmUsIGZpcnN0IGdldCB0aGUgbnVtYmVyIG9mIGRpZ2l0cyBvZiBxY1swXS5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggaSA9IDEsIHMgPSBxY1swXTsgcyA+PSAxMDsgcyAvPSAxMCwgaSsrICk7XG4gICAgICAgICAgICAgICAgICAgIHJvdW5kKCBxLCBkcCArICggcS5lID0gaSArIGUgKiBMT0dfQkFTRSAtIDEgKSArIDEsIHJtLCBtb3JlICk7XG5cbiAgICAgICAgICAgICAgICAvLyBDYWxsZXIgaXMgY29udmVydEJhc2UuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcS5lID0gZTtcbiAgICAgICAgICAgICAgICAgICAgcS5yID0gK21vcmU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHE7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9KSgpO1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgdmFsdWUgb2YgQmlnTnVtYmVyIG4gaW4gZml4ZWQtcG9pbnQgb3IgZXhwb25lbnRpYWxcbiAgICAgICAgICogbm90YXRpb24gcm91bmRlZCB0byB0aGUgc3BlY2lmaWVkIGRlY2ltYWwgcGxhY2VzIG9yIHNpZ25pZmljYW50IGRpZ2l0cy5cbiAgICAgICAgICpcbiAgICAgICAgICogbiBpcyBhIEJpZ051bWJlci5cbiAgICAgICAgICogaSBpcyB0aGUgaW5kZXggb2YgdGhlIGxhc3QgZGlnaXQgcmVxdWlyZWQgKGkuZS4gdGhlIGRpZ2l0IHRoYXQgbWF5IGJlIHJvdW5kZWQgdXApLlxuICAgICAgICAgKiBybSBpcyB0aGUgcm91bmRpbmcgbW9kZS5cbiAgICAgICAgICogY2FsbGVyIGlzIGNhbGxlciBpZDogdG9FeHBvbmVudGlhbCAxOSwgdG9GaXhlZCAyMCwgdG9Gb3JtYXQgMjEsIHRvUHJlY2lzaW9uIDI0LlxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gZm9ybWF0KCBuLCBpLCBybSwgY2FsbGVyICkge1xuICAgICAgICAgICAgdmFyIGMwLCBlLCBuZSwgbGVuLCBzdHI7XG5cbiAgICAgICAgICAgIHJtID0gcm0gIT0gbnVsbCAmJiBpc1ZhbGlkSW50KCBybSwgMCwgOCwgY2FsbGVyLCByb3VuZGluZ01vZGUgKVxuICAgICAgICAgICAgICA/IHJtIHwgMCA6IFJPVU5ESU5HX01PREU7XG5cbiAgICAgICAgICAgIGlmICggIW4uYyApIHJldHVybiBuLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICBjMCA9IG4uY1swXTtcbiAgICAgICAgICAgIG5lID0gbi5lO1xuXG4gICAgICAgICAgICBpZiAoIGkgPT0gbnVsbCApIHtcbiAgICAgICAgICAgICAgICBzdHIgPSBjb2VmZlRvU3RyaW5nKCBuLmMgKTtcbiAgICAgICAgICAgICAgICBzdHIgPSBjYWxsZXIgPT0gMTkgfHwgY2FsbGVyID09IDI0ICYmIG5lIDw9IFRPX0VYUF9ORUdcbiAgICAgICAgICAgICAgICAgID8gdG9FeHBvbmVudGlhbCggc3RyLCBuZSApXG4gICAgICAgICAgICAgICAgICA6IHRvRml4ZWRQb2ludCggc3RyLCBuZSApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuID0gcm91bmQoIG5ldyBCaWdOdW1iZXIobiksIGksIHJtICk7XG5cbiAgICAgICAgICAgICAgICAvLyBuLmUgbWF5IGhhdmUgY2hhbmdlZCBpZiB0aGUgdmFsdWUgd2FzIHJvdW5kZWQgdXAuXG4gICAgICAgICAgICAgICAgZSA9IG4uZTtcblxuICAgICAgICAgICAgICAgIHN0ciA9IGNvZWZmVG9TdHJpbmcoIG4uYyApO1xuICAgICAgICAgICAgICAgIGxlbiA9IHN0ci5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAvLyB0b1ByZWNpc2lvbiByZXR1cm5zIGV4cG9uZW50aWFsIG5vdGF0aW9uIGlmIHRoZSBudW1iZXIgb2Ygc2lnbmlmaWNhbnQgZGlnaXRzXG4gICAgICAgICAgICAgICAgLy8gc3BlY2lmaWVkIGlzIGxlc3MgdGhhbiB0aGUgbnVtYmVyIG9mIGRpZ2l0cyBuZWNlc3NhcnkgdG8gcmVwcmVzZW50IHRoZSBpbnRlZ2VyXG4gICAgICAgICAgICAgICAgLy8gcGFydCBvZiB0aGUgdmFsdWUgaW4gZml4ZWQtcG9pbnQgbm90YXRpb24uXG5cbiAgICAgICAgICAgICAgICAvLyBFeHBvbmVudGlhbCBub3RhdGlvbi5cbiAgICAgICAgICAgICAgICBpZiAoIGNhbGxlciA9PSAxOSB8fCBjYWxsZXIgPT0gMjQgJiYgKCBpIDw9IGUgfHwgZSA8PSBUT19FWFBfTkVHICkgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQXBwZW5kIHplcm9zP1xuICAgICAgICAgICAgICAgICAgICBmb3IgKCA7IGxlbiA8IGk7IHN0ciArPSAnMCcsIGxlbisrICk7XG4gICAgICAgICAgICAgICAgICAgIHN0ciA9IHRvRXhwb25lbnRpYWwoIHN0ciwgZSApO1xuXG4gICAgICAgICAgICAgICAgLy8gRml4ZWQtcG9pbnQgbm90YXRpb24uXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaSAtPSBuZTtcbiAgICAgICAgICAgICAgICAgICAgc3RyID0gdG9GaXhlZFBvaW50KCBzdHIsIGUgKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBBcHBlbmQgemVyb3M/XG4gICAgICAgICAgICAgICAgICAgIGlmICggZSArIDEgPiBsZW4gKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIC0taSA+IDAgKSBmb3IgKCBzdHIgKz0gJy4nOyBpLS07IHN0ciArPSAnMCcgKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGkgKz0gZSAtIGxlbjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICggaSA+IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBlICsgMSA9PSBsZW4gKSBzdHIgKz0gJy4nO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoIDsgaS0tOyBzdHIgKz0gJzAnICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBuLnMgPCAwICYmIGMwID8gJy0nICsgc3RyIDogc3RyO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBIYW5kbGUgQmlnTnVtYmVyLm1heCBhbmQgQmlnTnVtYmVyLm1pbi5cbiAgICAgICAgZnVuY3Rpb24gbWF4T3JNaW4oIGFyZ3MsIG1ldGhvZCApIHtcbiAgICAgICAgICAgIHZhciBtLCBuLFxuICAgICAgICAgICAgICAgIGkgPSAwO1xuXG4gICAgICAgICAgICBpZiAoIGlzQXJyYXkoIGFyZ3NbMF0gKSApIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgbSA9IG5ldyBCaWdOdW1iZXIoIGFyZ3NbMF0gKTtcblxuICAgICAgICAgICAgZm9yICggOyArK2kgPCBhcmdzLmxlbmd0aDsgKSB7XG4gICAgICAgICAgICAgICAgbiA9IG5ldyBCaWdOdW1iZXIoIGFyZ3NbaV0gKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIGFueSBudW1iZXIgaXMgTmFOLCByZXR1cm4gTmFOLlxuICAgICAgICAgICAgICAgIGlmICggIW4ucyApIHtcbiAgICAgICAgICAgICAgICAgICAgbSA9IG47XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIG1ldGhvZC5jYWxsKCBtLCBuICkgKSB7XG4gICAgICAgICAgICAgICAgICAgIG0gPSBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG07XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIG4gaXMgYW4gaW50ZWdlciBpbiByYW5nZSwgb3RoZXJ3aXNlIHRocm93LlxuICAgICAgICAgKiBVc2UgZm9yIGFyZ3VtZW50IHZhbGlkYXRpb24gd2hlbiBFUlJPUlMgaXMgdHJ1ZS5cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIGludFZhbGlkYXRvcldpdGhFcnJvcnMoIG4sIG1pbiwgbWF4LCBjYWxsZXIsIG5hbWUgKSB7XG4gICAgICAgICAgICBpZiAoIG4gPCBtaW4gfHwgbiA+IG1heCB8fCBuICE9IHRydW5jYXRlKG4pICkge1xuICAgICAgICAgICAgICAgIHJhaXNlKCBjYWxsZXIsICggbmFtZSB8fCAnZGVjaW1hbCBwbGFjZXMnICkgK1xuICAgICAgICAgICAgICAgICAgKCBuIDwgbWluIHx8IG4gPiBtYXggPyAnIG91dCBvZiByYW5nZScgOiAnIG5vdCBhbiBpbnRlZ2VyJyApLCBuICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBTdHJpcCB0cmFpbGluZyB6ZXJvcywgY2FsY3VsYXRlIGJhc2UgMTAgZXhwb25lbnQgYW5kIGNoZWNrIGFnYWluc3QgTUlOX0VYUCBhbmQgTUFYX0VYUC5cbiAgICAgICAgICogQ2FsbGVkIGJ5IG1pbnVzLCBwbHVzIGFuZCB0aW1lcy5cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIG5vcm1hbGlzZSggbiwgYywgZSApIHtcbiAgICAgICAgICAgIHZhciBpID0gMSxcbiAgICAgICAgICAgICAgICBqID0gYy5sZW5ndGg7XG5cbiAgICAgICAgICAgICAvLyBSZW1vdmUgdHJhaWxpbmcgemVyb3MuXG4gICAgICAgICAgICBmb3IgKCA7ICFjWy0tal07IGMucG9wKCkgKTtcblxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBiYXNlIDEwIGV4cG9uZW50LiBGaXJzdCBnZXQgdGhlIG51bWJlciBvZiBkaWdpdHMgb2YgY1swXS5cbiAgICAgICAgICAgIGZvciAoIGogPSBjWzBdOyBqID49IDEwOyBqIC89IDEwLCBpKysgKTtcblxuICAgICAgICAgICAgLy8gT3ZlcmZsb3c/XG4gICAgICAgICAgICBpZiAoICggZSA9IGkgKyBlICogTE9HX0JBU0UgLSAxICkgPiBNQVhfRVhQICkge1xuXG4gICAgICAgICAgICAgICAgLy8gSW5maW5pdHkuXG4gICAgICAgICAgICAgICAgbi5jID0gbi5lID0gbnVsbDtcblxuICAgICAgICAgICAgLy8gVW5kZXJmbG93P1xuICAgICAgICAgICAgfSBlbHNlIGlmICggZSA8IE1JTl9FWFAgKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBaZXJvLlxuICAgICAgICAgICAgICAgIG4uYyA9IFsgbi5lID0gMCBdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBuLmUgPSBlO1xuICAgICAgICAgICAgICAgIG4uYyA9IGM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBIYW5kbGUgdmFsdWVzIHRoYXQgZmFpbCB0aGUgdmFsaWRpdHkgdGVzdCBpbiBCaWdOdW1iZXIuXG4gICAgICAgIHBhcnNlTnVtZXJpYyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYmFzZVByZWZpeCA9IC9eKC0/KTAoW3hib10pL2ksXG4gICAgICAgICAgICAgICAgZG90QWZ0ZXIgPSAvXihbXi5dKylcXC4kLyxcbiAgICAgICAgICAgICAgICBkb3RCZWZvcmUgPSAvXlxcLihbXi5dKykkLyxcbiAgICAgICAgICAgICAgICBpc0luZmluaXR5T3JOYU4gPSAvXi0/KEluZmluaXR5fE5hTikkLyxcbiAgICAgICAgICAgICAgICB3aGl0ZXNwYWNlT3JQbHVzID0gL15cXHMqXFwrfF5cXHMrfFxccyskL2c7XG5cbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoIHgsIHN0ciwgbnVtLCBiICkge1xuICAgICAgICAgICAgICAgIHZhciBiYXNlLFxuICAgICAgICAgICAgICAgICAgICBzID0gbnVtID8gc3RyIDogc3RyLnJlcGxhY2UoIHdoaXRlc3BhY2VPclBsdXMsICcnICk7XG5cbiAgICAgICAgICAgICAgICAvLyBObyBleGNlcHRpb24gb24gwrFJbmZpbml0eSBvciBOYU4uXG4gICAgICAgICAgICAgICAgaWYgKCBpc0luZmluaXR5T3JOYU4udGVzdChzKSApIHtcbiAgICAgICAgICAgICAgICAgICAgeC5zID0gaXNOYU4ocykgPyBudWxsIDogcyA8IDAgPyAtMSA6IDE7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCAhbnVtICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBiYXNlUHJlZml4ID0gL14oLT8pMChbeGJvXSkoPz1cXHdbXFx3Ll0qJCkvaVxuICAgICAgICAgICAgICAgICAgICAgICAgcyA9IHMucmVwbGFjZSggYmFzZVByZWZpeCwgZnVuY3Rpb24gKCBtLCBwMSwgcDIgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmFzZSA9ICggcDIgPSBwMi50b0xvd2VyQ2FzZSgpICkgPT0gJ3gnID8gMTYgOiBwMiA9PSAnYicgPyAyIDogODtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWIgfHwgYiA9PSBiYXNlID8gcDEgOiBtO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmFzZSA9IGI7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBFLmcuICcxLicgdG8gJzEnLCAnLjEnIHRvICcwLjEnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcyA9IHMucmVwbGFjZSggZG90QWZ0ZXIsICckMScgKS5yZXBsYWNlKCBkb3RCZWZvcmUsICcwLiQxJyApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHN0ciAhPSBzICkgcmV0dXJuIG5ldyBCaWdOdW1iZXIoIHMsIGJhc2UgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vICduZXcgQmlnTnVtYmVyKCkgbm90IGEgbnVtYmVyOiB7bn0nXG4gICAgICAgICAgICAgICAgICAgIC8vICduZXcgQmlnTnVtYmVyKCkgbm90IGEgYmFzZSB7Yn0gbnVtYmVyOiB7bn0nXG4gICAgICAgICAgICAgICAgICAgIGlmIChFUlJPUlMpIHJhaXNlKCBpZCwgJ25vdCBhJyArICggYiA/ICcgYmFzZSAnICsgYiA6ICcnICkgKyAnIG51bWJlcicsIHN0ciApO1xuICAgICAgICAgICAgICAgICAgICB4LnMgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHguYyA9IHguZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWQgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSgpO1xuXG5cbiAgICAgICAgLy8gVGhyb3cgYSBCaWdOdW1iZXIgRXJyb3IuXG4gICAgICAgIGZ1bmN0aW9uIHJhaXNlKCBjYWxsZXIsIG1zZywgdmFsICkge1xuICAgICAgICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCBbXG4gICAgICAgICAgICAgICAgJ25ldyBCaWdOdW1iZXInLCAgICAgLy8gMFxuICAgICAgICAgICAgICAgICdjbXAnLCAgICAgICAgICAgICAgIC8vIDFcbiAgICAgICAgICAgICAgICAnY29uZmlnJywgICAgICAgICAgICAvLyAyXG4gICAgICAgICAgICAgICAgJ2RpdicsICAgICAgICAgICAgICAgLy8gM1xuICAgICAgICAgICAgICAgICdkaXZUb0ludCcsICAgICAgICAgIC8vIDRcbiAgICAgICAgICAgICAgICAnZXEnLCAgICAgICAgICAgICAgICAvLyA1XG4gICAgICAgICAgICAgICAgJ2d0JywgICAgICAgICAgICAgICAgLy8gNlxuICAgICAgICAgICAgICAgICdndGUnLCAgICAgICAgICAgICAgIC8vIDdcbiAgICAgICAgICAgICAgICAnbHQnLCAgICAgICAgICAgICAgICAvLyA4XG4gICAgICAgICAgICAgICAgJ2x0ZScsICAgICAgICAgICAgICAgLy8gOVxuICAgICAgICAgICAgICAgICdtaW51cycsICAgICAgICAgICAgIC8vIDEwXG4gICAgICAgICAgICAgICAgJ21vZCcsICAgICAgICAgICAgICAgLy8gMTFcbiAgICAgICAgICAgICAgICAncGx1cycsICAgICAgICAgICAgICAvLyAxMlxuICAgICAgICAgICAgICAgICdwcmVjaXNpb24nLCAgICAgICAgIC8vIDEzXG4gICAgICAgICAgICAgICAgJ3JhbmRvbScsICAgICAgICAgICAgLy8gMTRcbiAgICAgICAgICAgICAgICAncm91bmQnLCAgICAgICAgICAgICAvLyAxNVxuICAgICAgICAgICAgICAgICdzaGlmdCcsICAgICAgICAgICAgIC8vIDE2XG4gICAgICAgICAgICAgICAgJ3RpbWVzJywgICAgICAgICAgICAgLy8gMTdcbiAgICAgICAgICAgICAgICAndG9EaWdpdHMnLCAgICAgICAgICAvLyAxOFxuICAgICAgICAgICAgICAgICd0b0V4cG9uZW50aWFsJywgICAgIC8vIDE5XG4gICAgICAgICAgICAgICAgJ3RvRml4ZWQnLCAgICAgICAgICAgLy8gMjBcbiAgICAgICAgICAgICAgICAndG9Gb3JtYXQnLCAgICAgICAgICAvLyAyMVxuICAgICAgICAgICAgICAgICd0b0ZyYWN0aW9uJywgICAgICAgIC8vIDIyXG4gICAgICAgICAgICAgICAgJ3BvdycsICAgICAgICAgICAgICAgLy8gMjNcbiAgICAgICAgICAgICAgICAndG9QcmVjaXNpb24nLCAgICAgICAvLyAyNFxuICAgICAgICAgICAgICAgICd0b1N0cmluZycsICAgICAgICAgIC8vIDI1XG4gICAgICAgICAgICAgICAgJ0JpZ051bWJlcicgICAgICAgICAgLy8gMjZcbiAgICAgICAgICAgIF1bY2FsbGVyXSArICcoKSAnICsgbXNnICsgJzogJyArIHZhbCApO1xuXG4gICAgICAgICAgICBlcnJvci5uYW1lID0gJ0JpZ051bWJlciBFcnJvcic7XG4gICAgICAgICAgICBpZCA9IDA7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUm91bmQgeCB0byBzZCBzaWduaWZpY2FudCBkaWdpdHMgdXNpbmcgcm91bmRpbmcgbW9kZSBybS4gQ2hlY2sgZm9yIG92ZXIvdW5kZXItZmxvdy5cbiAgICAgICAgICogSWYgciBpcyB0cnV0aHksIGl0IGlzIGtub3duIHRoYXQgdGhlcmUgYXJlIG1vcmUgZGlnaXRzIGFmdGVyIHRoZSByb3VuZGluZyBkaWdpdC5cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIHJvdW5kKCB4LCBzZCwgcm0sIHIgKSB7XG4gICAgICAgICAgICB2YXIgZCwgaSwgaiwgaywgbiwgbmksIHJkLFxuICAgICAgICAgICAgICAgIHhjID0geC5jLFxuICAgICAgICAgICAgICAgIHBvd3MxMCA9IFBPV1NfVEVOO1xuXG4gICAgICAgICAgICAvLyBpZiB4IGlzIG5vdCBJbmZpbml0eSBvciBOYU4uLi5cbiAgICAgICAgICAgIGlmICh4Yykge1xuXG4gICAgICAgICAgICAgICAgLy8gcmQgaXMgdGhlIHJvdW5kaW5nIGRpZ2l0LCBpLmUuIHRoZSBkaWdpdCBhZnRlciB0aGUgZGlnaXQgdGhhdCBtYXkgYmUgcm91bmRlZCB1cC5cbiAgICAgICAgICAgICAgICAvLyBuIGlzIGEgYmFzZSAxZTE0IG51bWJlciwgdGhlIHZhbHVlIG9mIHRoZSBlbGVtZW50IG9mIGFycmF5IHguYyBjb250YWluaW5nIHJkLlxuICAgICAgICAgICAgICAgIC8vIG5pIGlzIHRoZSBpbmRleCBvZiBuIHdpdGhpbiB4LmMuXG4gICAgICAgICAgICAgICAgLy8gZCBpcyB0aGUgbnVtYmVyIG9mIGRpZ2l0cyBvZiBuLlxuICAgICAgICAgICAgICAgIC8vIGkgaXMgdGhlIGluZGV4IG9mIHJkIHdpdGhpbiBuIGluY2x1ZGluZyBsZWFkaW5nIHplcm9zLlxuICAgICAgICAgICAgICAgIC8vIGogaXMgdGhlIGFjdHVhbCBpbmRleCBvZiByZCB3aXRoaW4gbiAoaWYgPCAwLCByZCBpcyBhIGxlYWRpbmcgemVybykuXG4gICAgICAgICAgICAgICAgb3V0OiB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IHRoZSBudW1iZXIgb2YgZGlnaXRzIG9mIHRoZSBmaXJzdCBlbGVtZW50IG9mIHhjLlxuICAgICAgICAgICAgICAgICAgICBmb3IgKCBkID0gMSwgayA9IHhjWzBdOyBrID49IDEwOyBrIC89IDEwLCBkKysgKTtcbiAgICAgICAgICAgICAgICAgICAgaSA9IHNkIC0gZDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgcm91bmRpbmcgZGlnaXQgaXMgaW4gdGhlIGZpcnN0IGVsZW1lbnQgb2YgeGMuLi5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBpIDwgMCApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGkgKz0gTE9HX0JBU0U7XG4gICAgICAgICAgICAgICAgICAgICAgICBqID0gc2Q7XG4gICAgICAgICAgICAgICAgICAgICAgICBuID0geGNbIG5pID0gMCBdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIHJvdW5kaW5nIGRpZ2l0IGF0IGluZGV4IGogb2Ygbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJkID0gbiAvIHBvd3MxMFsgZCAtIGogLSAxIF0gJSAxMCB8IDA7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuaSA9IG1hdGhjZWlsKCAoIGkgKyAxICkgLyBMT0dfQkFTRSApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIG5pID49IHhjLmxlbmd0aCApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTmVlZGVkIGJ5IHNxcnQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoIDsgeGMubGVuZ3RoIDw9IG5pOyB4Yy5wdXNoKDApICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG4gPSByZCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGQgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpICU9IExPR19CQVNFO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBqID0gaSAtIExPR19CQVNFICsgMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhayBvdXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuID0gayA9IHhjW25pXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgbnVtYmVyIG9mIGRpZ2l0cyBvZiBuLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoIGQgPSAxOyBrID49IDEwOyBrIC89IDEwLCBkKysgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgaW5kZXggb2YgcmQgd2l0aGluIG4uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaSAlPSBMT0dfQkFTRTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgaW5kZXggb2YgcmQgd2l0aGluIG4sIGFkanVzdGVkIGZvciBsZWFkaW5nIHplcm9zLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBudW1iZXIgb2YgbGVhZGluZyB6ZXJvcyBvZiBuIGlzIGdpdmVuIGJ5IExPR19CQVNFIC0gZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBqID0gaSAtIExPR19CQVNFICsgZDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgcm91bmRpbmcgZGlnaXQgYXQgaW5kZXggaiBvZiBuLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJkID0gaiA8IDAgPyAwIDogbiAvIHBvd3MxMFsgZCAtIGogLSAxIF0gJSAxMCB8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByID0gciB8fCBzZCA8IDAgfHxcblxuICAgICAgICAgICAgICAgICAgICAvLyBBcmUgdGhlcmUgYW55IG5vbi16ZXJvIGRpZ2l0cyBhZnRlciB0aGUgcm91bmRpbmcgZGlnaXQ/XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBleHByZXNzaW9uICBuICUgcG93czEwWyBkIC0gaiAtIDEgXSAgcmV0dXJucyBhbGwgZGlnaXRzIG9mIG4gdG8gdGhlIHJpZ2h0XG4gICAgICAgICAgICAgICAgICAgIC8vIG9mIHRoZSBkaWdpdCBhdCBqLCBlLmcuIGlmIG4gaXMgOTA4NzE0IGFuZCBqIGlzIDIsIHRoZSBleHByZXNzaW9uIGdpdmVzIDcxNC5cbiAgICAgICAgICAgICAgICAgICAgICB4Y1tuaSArIDFdICE9IG51bGwgfHwgKCBqIDwgMCA/IG4gOiBuICUgcG93czEwWyBkIC0gaiAtIDEgXSApO1xuXG4gICAgICAgICAgICAgICAgICAgIHIgPSBybSA8IDRcbiAgICAgICAgICAgICAgICAgICAgICA/ICggcmQgfHwgciApICYmICggcm0gPT0gMCB8fCBybSA9PSAoIHgucyA8IDAgPyAzIDogMiApIClcbiAgICAgICAgICAgICAgICAgICAgICA6IHJkID4gNSB8fCByZCA9PSA1ICYmICggcm0gPT0gNCB8fCByIHx8IHJtID09IDYgJiZcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgd2hldGhlciB0aGUgZGlnaXQgdG8gdGhlIGxlZnQgb2YgdGhlIHJvdW5kaW5nIGRpZ2l0IGlzIG9kZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICggKCBpID4gMCA/IGogPiAwID8gbiAvIHBvd3MxMFsgZCAtIGogXSA6IDAgOiB4Y1tuaSAtIDFdICkgJSAxMCApICYgMSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICBybSA9PSAoIHgucyA8IDAgPyA4IDogNyApICk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBzZCA8IDEgfHwgIXhjWzBdICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgeGMubGVuZ3RoID0gMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHIpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIENvbnZlcnQgc2QgdG8gZGVjaW1hbCBwbGFjZXMuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2QgLT0geC5lICsgMTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDEsIDAuMSwgMC4wMSwgMC4wMDEsIDAuMDAwMSBldGMuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeGNbMF0gPSBwb3dzMTBbIHNkICUgTE9HX0JBU0UgXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4LmUgPSAtc2QgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBaZXJvLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHhjWzBdID0geC5lID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBSZW1vdmUgZXhjZXNzIGRpZ2l0cy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBpID09IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4Yy5sZW5ndGggPSBuaTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGsgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmktLTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHhjLmxlbmd0aCA9IG5pICsgMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGsgPSBwb3dzMTBbIExPR19CQVNFIC0gaSBdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBFLmcuIDU2NzAwIGJlY29tZXMgNTYwMDAgaWYgNyBpcyB0aGUgcm91bmRpbmcgZGlnaXQuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBqID4gMCBtZWFucyBpID4gbnVtYmVyIG9mIGxlYWRpbmcgemVyb3Mgb2Ygbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIHhjW25pXSA9IGogPiAwID8gbWF0aGZsb29yKCBuIC8gcG93czEwWyBkIC0gaiBdICUgcG93czEwW2pdICkgKiBrIDogMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJvdW5kIHVwP1xuICAgICAgICAgICAgICAgICAgICBpZiAocikge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCA7IDsgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZGlnaXQgdG8gYmUgcm91bmRlZCB1cCBpcyBpbiB0aGUgZmlyc3QgZWxlbWVudCBvZiB4Yy4uLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggbmkgPT0gMCApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpIHdpbGwgYmUgdGhlIGxlbmd0aCBvZiB4Y1swXSBiZWZvcmUgayBpcyBhZGRlZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yICggaSA9IDEsIGogPSB4Y1swXTsgaiA+PSAxMDsgaiAvPSAxMCwgaSsrICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGogPSB4Y1swXSArPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCBrID0gMTsgaiA+PSAxMDsgaiAvPSAxMCwgaysrICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgaSAhPSBrIHRoZSBsZW5ndGggaGFzIGluY3JlYXNlZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBpICE9IGsgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4LmUrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggeGNbMF0gPT0gQkFTRSApIHhjWzBdID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHhjW25pXSArPSBrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHhjW25pXSAhPSBCQVNFICkgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHhjW25pLS1dID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgayA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIHRyYWlsaW5nIHplcm9zLlxuICAgICAgICAgICAgICAgICAgICBmb3IgKCBpID0geGMubGVuZ3RoOyB4Y1stLWldID09PSAwOyB4Yy5wb3AoKSApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIE92ZXJmbG93PyBJbmZpbml0eS5cbiAgICAgICAgICAgICAgICBpZiAoIHguZSA+IE1BWF9FWFAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHguYyA9IHguZSA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICAvLyBVbmRlcmZsb3c/IFplcm8uXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICggeC5lIDwgTUlOX0VYUCApIHtcbiAgICAgICAgICAgICAgICAgICAgeC5jID0gWyB4LmUgPSAwIF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUFJPVE9UWVBFL0lOU1RBTkNFIE1FVEhPRFNcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIGFic29sdXRlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5hYnNvbHV0ZVZhbHVlID0gUC5hYnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgeCA9IG5ldyBCaWdOdW1iZXIodGhpcyk7XG4gICAgICAgICAgICBpZiAoIHgucyA8IDAgKSB4LnMgPSAxO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciByb3VuZGVkIHRvIGEgd2hvbGVcbiAgICAgICAgICogbnVtYmVyIGluIHRoZSBkaXJlY3Rpb24gb2YgSW5maW5pdHkuXG4gICAgICAgICAqL1xuICAgICAgICBQLmNlaWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gcm91bmQoIG5ldyBCaWdOdW1iZXIodGhpcyksIHRoaXMuZSArIDEsIDIgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVyblxuICAgICAgICAgKiAxIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBncmVhdGVyIHRoYW4gdGhlIHZhbHVlIG9mIEJpZ051bWJlcih5LCBiKSxcbiAgICAgICAgICogLTEgaWYgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGlzIGxlc3MgdGhhbiB0aGUgdmFsdWUgb2YgQmlnTnVtYmVyKHksIGIpLFxuICAgICAgICAgKiAwIGlmIHRoZXkgaGF2ZSB0aGUgc2FtZSB2YWx1ZSxcbiAgICAgICAgICogb3IgbnVsbCBpZiB0aGUgdmFsdWUgb2YgZWl0aGVyIGlzIE5hTi5cbiAgICAgICAgICovXG4gICAgICAgIFAuY29tcGFyZWRUbyA9IFAuY21wID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgaWQgPSAxO1xuICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmUoIHRoaXMsIG5ldyBCaWdOdW1iZXIoIHksIGIgKSApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIHRoZSBudW1iZXIgb2YgZGVjaW1hbCBwbGFjZXMgb2YgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyLCBvciBudWxsIGlmIHRoZSB2YWx1ZVxuICAgICAgICAgKiBvZiB0aGlzIEJpZ051bWJlciBpcyDCsUluZmluaXR5IG9yIE5hTi5cbiAgICAgICAgICovXG4gICAgICAgIFAuZGVjaW1hbFBsYWNlcyA9IFAuZHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgbiwgdixcbiAgICAgICAgICAgICAgICBjID0gdGhpcy5jO1xuXG4gICAgICAgICAgICBpZiAoICFjICkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBuID0gKCAoIHYgPSBjLmxlbmd0aCAtIDEgKSAtIGJpdEZsb29yKCB0aGlzLmUgLyBMT0dfQkFTRSApICkgKiBMT0dfQkFTRTtcblxuICAgICAgICAgICAgLy8gU3VidHJhY3QgdGhlIG51bWJlciBvZiB0cmFpbGluZyB6ZXJvcyBvZiB0aGUgbGFzdCBudW1iZXIuXG4gICAgICAgICAgICBpZiAoIHYgPSBjW3ZdICkgZm9yICggOyB2ICUgMTAgPT0gMDsgdiAvPSAxMCwgbi0tICk7XG4gICAgICAgICAgICBpZiAoIG4gPCAwICkgbiA9IDA7XG5cbiAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogIG4gLyAwID0gSVxuICAgICAgICAgKiAgbiAvIE4gPSBOXG4gICAgICAgICAqICBuIC8gSSA9IDBcbiAgICAgICAgICogIDAgLyBuID0gMFxuICAgICAgICAgKiAgMCAvIDAgPSBOXG4gICAgICAgICAqICAwIC8gTiA9IE5cbiAgICAgICAgICogIDAgLyBJID0gMFxuICAgICAgICAgKiAgTiAvIG4gPSBOXG4gICAgICAgICAqICBOIC8gMCA9IE5cbiAgICAgICAgICogIE4gLyBOID0gTlxuICAgICAgICAgKiAgTiAvIEkgPSBOXG4gICAgICAgICAqICBJIC8gbiA9IElcbiAgICAgICAgICogIEkgLyAwID0gSVxuICAgICAgICAgKiAgSSAvIE4gPSBOXG4gICAgICAgICAqICBJIC8gSSA9IE5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgZGl2aWRlZCBieSB0aGUgdmFsdWUgb2ZcbiAgICAgICAgICogQmlnTnVtYmVyKHksIGIpLCByb3VuZGVkIGFjY29yZGluZyB0byBERUNJTUFMX1BMQUNFUyBhbmQgUk9VTkRJTkdfTU9ERS5cbiAgICAgICAgICovXG4gICAgICAgIFAuZGl2aWRlZEJ5ID0gUC5kaXYgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICBpZCA9IDM7XG4gICAgICAgICAgICByZXR1cm4gZGl2KCB0aGlzLCBuZXcgQmlnTnVtYmVyKCB5LCBiICksIERFQ0lNQUxfUExBQ0VTLCBST1VORElOR19NT0RFICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSBpbnRlZ2VyIHBhcnQgb2YgZGl2aWRpbmcgdGhlIHZhbHVlIG9mIHRoaXNcbiAgICAgICAgICogQmlnTnVtYmVyIGJ5IHRoZSB2YWx1ZSBvZiBCaWdOdW1iZXIoeSwgYikuXG4gICAgICAgICAqL1xuICAgICAgICBQLmRpdmlkZWRUb0ludGVnZXJCeSA9IFAuZGl2VG9JbnQgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICBpZCA9IDQ7XG4gICAgICAgICAgICByZXR1cm4gZGl2KCB0aGlzLCBuZXcgQmlnTnVtYmVyKCB5LCBiICksIDAsIDEgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBlcXVhbCB0byB0aGUgdmFsdWUgb2YgQmlnTnVtYmVyKHksIGIpLFxuICAgICAgICAgKiBvdGhlcndpc2UgcmV0dXJucyBmYWxzZS5cbiAgICAgICAgICovXG4gICAgICAgIFAuZXF1YWxzID0gUC5lcSA9IGZ1bmN0aW9uICggeSwgYiApIHtcbiAgICAgICAgICAgIGlkID0gNTtcbiAgICAgICAgICAgIHJldHVybiBjb21wYXJlKCB0aGlzLCBuZXcgQmlnTnVtYmVyKCB5LCBiICkgKSA9PT0gMDtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIHJvdW5kZWQgdG8gYSB3aG9sZVxuICAgICAgICAgKiBudW1iZXIgaW4gdGhlIGRpcmVjdGlvbiBvZiAtSW5maW5pdHkuXG4gICAgICAgICAqL1xuICAgICAgICBQLmZsb29yID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvdW5kKCBuZXcgQmlnTnVtYmVyKHRoaXMpLCB0aGlzLmUgKyAxLCAzICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgZ3JlYXRlciB0aGFuIHRoZSB2YWx1ZSBvZiBCaWdOdW1iZXIoeSwgYiksXG4gICAgICAgICAqIG90aGVyd2lzZSByZXR1cm5zIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5ncmVhdGVyVGhhbiA9IFAuZ3QgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICBpZCA9IDY7XG4gICAgICAgICAgICByZXR1cm4gY29tcGFyZSggdGhpcywgbmV3IEJpZ051bWJlciggeSwgYiApICkgPiAwO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIHRydWUgaWYgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgdmFsdWUgb2ZcbiAgICAgICAgICogQmlnTnVtYmVyKHksIGIpLCBvdGhlcndpc2UgcmV0dXJucyBmYWxzZS5cbiAgICAgICAgICovXG4gICAgICAgIFAuZ3JlYXRlclRoYW5PckVxdWFsVG8gPSBQLmd0ZSA9IGZ1bmN0aW9uICggeSwgYiApIHtcbiAgICAgICAgICAgIGlkID0gNztcbiAgICAgICAgICAgIHJldHVybiAoIGIgPSBjb21wYXJlKCB0aGlzLCBuZXcgQmlnTnVtYmVyKCB5LCBiICkgKSApID09PSAxIHx8IGIgPT09IDA7XG5cbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBhIGZpbml0ZSBudW1iZXIsIG90aGVyd2lzZSByZXR1cm5zIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5pc0Zpbml0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIXRoaXMuYztcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBhbiBpbnRlZ2VyLCBvdGhlcndpc2UgcmV0dXJuIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5pc0ludGVnZXIgPSBQLmlzSW50ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICEhdGhpcy5jICYmIGJpdEZsb29yKCB0aGlzLmUgLyBMT0dfQkFTRSApID4gdGhpcy5jLmxlbmd0aCAtIDI7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgTmFOLCBvdGhlcndpc2UgcmV0dXJucyBmYWxzZS5cbiAgICAgICAgICovXG4gICAgICAgIFAuaXNOYU4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gIXRoaXMucztcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBuZWdhdGl2ZSwgb3RoZXJ3aXNlIHJldHVybnMgZmFsc2UuXG4gICAgICAgICAqL1xuICAgICAgICBQLmlzTmVnYXRpdmUgPSBQLmlzTmVnID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucyA8IDA7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgMCBvciAtMCwgb3RoZXJ3aXNlIHJldHVybnMgZmFsc2UuXG4gICAgICAgICAqL1xuICAgICAgICBQLmlzWmVybyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIXRoaXMuYyAmJiB0aGlzLmNbMF0gPT0gMDtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBsZXNzIHRoYW4gdGhlIHZhbHVlIG9mIEJpZ051bWJlcih5LCBiKSxcbiAgICAgICAgICogb3RoZXJ3aXNlIHJldHVybnMgZmFsc2UuXG4gICAgICAgICAqL1xuICAgICAgICBQLmxlc3NUaGFuID0gUC5sdCA9IGZ1bmN0aW9uICggeSwgYiApIHtcbiAgICAgICAgICAgIGlkID0gODtcbiAgICAgICAgICAgIHJldHVybiBjb21wYXJlKCB0aGlzLCBuZXcgQmlnTnVtYmVyKCB5LCBiICkgKSA8IDA7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIHRoZSB2YWx1ZSBvZlxuICAgICAgICAgKiBCaWdOdW1iZXIoeSwgYiksIG90aGVyd2lzZSByZXR1cm5zIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5sZXNzVGhhbk9yRXF1YWxUbyA9IFAubHRlID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgaWQgPSA5O1xuICAgICAgICAgICAgcmV0dXJuICggYiA9IGNvbXBhcmUoIHRoaXMsIG5ldyBCaWdOdW1iZXIoIHksIGIgKSApICkgPT09IC0xIHx8IGIgPT09IDA7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiAgbiAtIDAgPSBuXG4gICAgICAgICAqICBuIC0gTiA9IE5cbiAgICAgICAgICogIG4gLSBJID0gLUlcbiAgICAgICAgICogIDAgLSBuID0gLW5cbiAgICAgICAgICogIDAgLSAwID0gMFxuICAgICAgICAgKiAgMCAtIE4gPSBOXG4gICAgICAgICAqICAwIC0gSSA9IC1JXG4gICAgICAgICAqICBOIC0gbiA9IE5cbiAgICAgICAgICogIE4gLSAwID0gTlxuICAgICAgICAgKiAgTiAtIE4gPSBOXG4gICAgICAgICAqICBOIC0gSSA9IE5cbiAgICAgICAgICogIEkgLSBuID0gSVxuICAgICAgICAgKiAgSSAtIDAgPSBJXG4gICAgICAgICAqICBJIC0gTiA9IE5cbiAgICAgICAgICogIEkgLSBJID0gTlxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBtaW51cyB0aGUgdmFsdWUgb2ZcbiAgICAgICAgICogQmlnTnVtYmVyKHksIGIpLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5taW51cyA9IFAuc3ViID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgdmFyIGksIGosIHQsIHhMVHksXG4gICAgICAgICAgICAgICAgeCA9IHRoaXMsXG4gICAgICAgICAgICAgICAgYSA9IHgucztcblxuICAgICAgICAgICAgaWQgPSAxMDtcbiAgICAgICAgICAgIHkgPSBuZXcgQmlnTnVtYmVyKCB5LCBiICk7XG4gICAgICAgICAgICBiID0geS5zO1xuXG4gICAgICAgICAgICAvLyBFaXRoZXIgTmFOP1xuICAgICAgICAgICAgaWYgKCAhYSB8fCAhYiApIHJldHVybiBuZXcgQmlnTnVtYmVyKE5hTik7XG5cbiAgICAgICAgICAgIC8vIFNpZ25zIGRpZmZlcj9cbiAgICAgICAgICAgIGlmICggYSAhPSBiICkge1xuICAgICAgICAgICAgICAgIHkucyA9IC1iO1xuICAgICAgICAgICAgICAgIHJldHVybiB4LnBsdXMoeSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB4ZSA9IHguZSAvIExPR19CQVNFLFxuICAgICAgICAgICAgICAgIHllID0geS5lIC8gTE9HX0JBU0UsXG4gICAgICAgICAgICAgICAgeGMgPSB4LmMsXG4gICAgICAgICAgICAgICAgeWMgPSB5LmM7XG5cbiAgICAgICAgICAgIGlmICggIXhlIHx8ICF5ZSApIHtcblxuICAgICAgICAgICAgICAgIC8vIEVpdGhlciBJbmZpbml0eT9cbiAgICAgICAgICAgICAgICBpZiAoICF4YyB8fCAheWMgKSByZXR1cm4geGMgPyAoIHkucyA9IC1iLCB5ICkgOiBuZXcgQmlnTnVtYmVyKCB5YyA/IHggOiBOYU4gKTtcblxuICAgICAgICAgICAgICAgIC8vIEVpdGhlciB6ZXJvP1xuICAgICAgICAgICAgICAgIGlmICggIXhjWzBdIHx8ICF5Y1swXSApIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBSZXR1cm4geSBpZiB5IGlzIG5vbi16ZXJvLCB4IGlmIHggaXMgbm9uLXplcm8sIG9yIHplcm8gaWYgYm90aCBhcmUgemVyby5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHljWzBdID8gKCB5LnMgPSAtYiwgeSApIDogbmV3IEJpZ051bWJlciggeGNbMF0gPyB4IDpcblxuICAgICAgICAgICAgICAgICAgICAgIC8vIElFRUUgNzU0ICgyMDA4KSA2LjM6IG4gLSBuID0gLTAgd2hlbiByb3VuZGluZyB0byAtSW5maW5pdHlcbiAgICAgICAgICAgICAgICAgICAgICBST1VORElOR19NT0RFID09IDMgPyAtMCA6IDAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHhlID0gYml0Rmxvb3IoeGUpO1xuICAgICAgICAgICAgeWUgPSBiaXRGbG9vcih5ZSk7XG4gICAgICAgICAgICB4YyA9IHhjLnNsaWNlKCk7XG5cbiAgICAgICAgICAgIC8vIERldGVybWluZSB3aGljaCBpcyB0aGUgYmlnZ2VyIG51bWJlci5cbiAgICAgICAgICAgIGlmICggYSA9IHhlIC0geWUgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIHhMVHkgPSBhIDwgMCApIHtcbiAgICAgICAgICAgICAgICAgICAgYSA9IC1hO1xuICAgICAgICAgICAgICAgICAgICB0ID0geGM7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgeWUgPSB4ZTtcbiAgICAgICAgICAgICAgICAgICAgdCA9IHljO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHQucmV2ZXJzZSgpO1xuXG4gICAgICAgICAgICAgICAgLy8gUHJlcGVuZCB6ZXJvcyB0byBlcXVhbGlzZSBleHBvbmVudHMuXG4gICAgICAgICAgICAgICAgZm9yICggYiA9IGE7IGItLTsgdC5wdXNoKDApICk7XG4gICAgICAgICAgICAgICAgdC5yZXZlcnNlKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgLy8gRXhwb25lbnRzIGVxdWFsLiBDaGVjayBkaWdpdCBieSBkaWdpdC5cbiAgICAgICAgICAgICAgICBqID0gKCB4TFR5ID0gKCBhID0geGMubGVuZ3RoICkgPCAoIGIgPSB5Yy5sZW5ndGggKSApID8gYSA6IGI7XG5cbiAgICAgICAgICAgICAgICBmb3IgKCBhID0gYiA9IDA7IGIgPCBqOyBiKysgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCB4Y1tiXSAhPSB5Y1tiXSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHhMVHkgPSB4Y1tiXSA8IHljW2JdO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHggPCB5PyBQb2ludCB4YyB0byB0aGUgYXJyYXkgb2YgdGhlIGJpZ2dlciBudW1iZXIuXG4gICAgICAgICAgICBpZiAoeExUeSkgdCA9IHhjLCB4YyA9IHljLCB5YyA9IHQsIHkucyA9IC15LnM7XG5cbiAgICAgICAgICAgIGIgPSAoIGogPSB5Yy5sZW5ndGggKSAtICggaSA9IHhjLmxlbmd0aCApO1xuXG4gICAgICAgICAgICAvLyBBcHBlbmQgemVyb3MgdG8geGMgaWYgc2hvcnRlci5cbiAgICAgICAgICAgIC8vIE5vIG5lZWQgdG8gYWRkIHplcm9zIHRvIHljIGlmIHNob3J0ZXIgYXMgc3VidHJhY3Qgb25seSBuZWVkcyB0byBzdGFydCBhdCB5Yy5sZW5ndGguXG4gICAgICAgICAgICBpZiAoIGIgPiAwICkgZm9yICggOyBiLS07IHhjW2krK10gPSAwICk7XG4gICAgICAgICAgICBiID0gQkFTRSAtIDE7XG5cbiAgICAgICAgICAgIC8vIFN1YnRyYWN0IHljIGZyb20geGMuXG4gICAgICAgICAgICBmb3IgKCA7IGogPiBhOyApIHtcblxuICAgICAgICAgICAgICAgIGlmICggeGNbLS1qXSA8IHljW2pdICkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKCBpID0gajsgaSAmJiAheGNbLS1pXTsgeGNbaV0gPSBiICk7XG4gICAgICAgICAgICAgICAgICAgIC0teGNbaV07XG4gICAgICAgICAgICAgICAgICAgIHhjW2pdICs9IEJBU0U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgeGNbal0gLT0geWNbal07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIHplcm9zIGFuZCBhZGp1c3QgZXhwb25lbnQgYWNjb3JkaW5nbHkuXG4gICAgICAgICAgICBmb3IgKCA7IHhjWzBdID09IDA7IHhjLnNoaWZ0KCksIC0teWUgKTtcblxuICAgICAgICAgICAgLy8gWmVybz9cbiAgICAgICAgICAgIGlmICggIXhjWzBdICkge1xuXG4gICAgICAgICAgICAgICAgLy8gRm9sbG93aW5nIElFRUUgNzU0ICgyMDA4KSA2LjMsXG4gICAgICAgICAgICAgICAgLy8gbiAtIG4gPSArMCAgYnV0ICBuIC0gbiA9IC0wICB3aGVuIHJvdW5kaW5nIHRvd2FyZHMgLUluZmluaXR5LlxuICAgICAgICAgICAgICAgIHkucyA9IFJPVU5ESU5HX01PREUgPT0gMyA/IC0xIDogMTtcbiAgICAgICAgICAgICAgICB5LmMgPSBbIHkuZSA9IDAgXTtcbiAgICAgICAgICAgICAgICByZXR1cm4geTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm8gbmVlZCB0byBjaGVjayBmb3IgSW5maW5pdHkgYXMgK3ggLSAreSAhPSBJbmZpbml0eSAmJiAteCAtIC15ICE9IEluZmluaXR5XG4gICAgICAgICAgICAvLyBmb3IgZmluaXRlIHggYW5kIHkuXG4gICAgICAgICAgICByZXR1cm4gbm9ybWFsaXNlKCB5LCB4YywgeWUgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqICAgbiAlIDAgPSAgTlxuICAgICAgICAgKiAgIG4gJSBOID0gIE5cbiAgICAgICAgICogICBuICUgSSA9ICBuXG4gICAgICAgICAqICAgMCAlIG4gPSAgMFxuICAgICAgICAgKiAgLTAgJSBuID0gLTBcbiAgICAgICAgICogICAwICUgMCA9ICBOXG4gICAgICAgICAqICAgMCAlIE4gPSAgTlxuICAgICAgICAgKiAgIDAgJSBJID0gIDBcbiAgICAgICAgICogICBOICUgbiA9ICBOXG4gICAgICAgICAqICAgTiAlIDAgPSAgTlxuICAgICAgICAgKiAgIE4gJSBOID0gIE5cbiAgICAgICAgICogICBOICUgSSA9ICBOXG4gICAgICAgICAqICAgSSAlIG4gPSAgTlxuICAgICAgICAgKiAgIEkgJSAwID0gIE5cbiAgICAgICAgICogICBJICUgTiA9ICBOXG4gICAgICAgICAqICAgSSAlIEkgPSAgTlxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBtb2R1bG8gdGhlIHZhbHVlIG9mXG4gICAgICAgICAqIEJpZ051bWJlcih5LCBiKS4gVGhlIHJlc3VsdCBkZXBlbmRzIG9uIHRoZSB2YWx1ZSBvZiBNT0RVTE9fTU9ERS5cbiAgICAgICAgICovXG4gICAgICAgIFAubW9kdWxvID0gUC5tb2QgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICB2YXIgcSwgcyxcbiAgICAgICAgICAgICAgICB4ID0gdGhpcztcblxuICAgICAgICAgICAgaWQgPSAxMTtcbiAgICAgICAgICAgIHkgPSBuZXcgQmlnTnVtYmVyKCB5LCBiICk7XG5cbiAgICAgICAgICAgIC8vIFJldHVybiBOYU4gaWYgeCBpcyBJbmZpbml0eSBvciBOYU4sIG9yIHkgaXMgTmFOIG9yIHplcm8uXG4gICAgICAgICAgICBpZiAoICF4LmMgfHwgIXkucyB8fCB5LmMgJiYgIXkuY1swXSApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IEJpZ051bWJlcihOYU4pO1xuXG4gICAgICAgICAgICAvLyBSZXR1cm4geCBpZiB5IGlzIEluZmluaXR5IG9yIHggaXMgemVyby5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoICF5LmMgfHwgeC5jICYmICF4LmNbMF0gKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBCaWdOdW1iZXIoeCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICggTU9EVUxPX01PREUgPT0gOSApIHtcblxuICAgICAgICAgICAgICAgIC8vIEV1Y2xpZGlhbiBkaXZpc2lvbjogcSA9IHNpZ24oeSkgKiBmbG9vcih4IC8gYWJzKHkpKVxuICAgICAgICAgICAgICAgIC8vIHIgPSB4IC0gcXkgICAgd2hlcmUgIDAgPD0gciA8IGFicyh5KVxuICAgICAgICAgICAgICAgIHMgPSB5LnM7XG4gICAgICAgICAgICAgICAgeS5zID0gMTtcbiAgICAgICAgICAgICAgICBxID0gZGl2KCB4LCB5LCAwLCAzICk7XG4gICAgICAgICAgICAgICAgeS5zID0gcztcbiAgICAgICAgICAgICAgICBxLnMgKj0gcztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcSA9IGRpdiggeCwgeSwgMCwgTU9EVUxPX01PREUgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHgubWludXMoIHEudGltZXMoeSkgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIG5lZ2F0ZWQsXG4gICAgICAgICAqIGkuZS4gbXVsdGlwbGllZCBieSAtMS5cbiAgICAgICAgICovXG4gICAgICAgIFAubmVnYXRlZCA9IFAubmVnID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHggPSBuZXcgQmlnTnVtYmVyKHRoaXMpO1xuICAgICAgICAgICAgeC5zID0gLXgucyB8fCBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiAgbiArIDAgPSBuXG4gICAgICAgICAqICBuICsgTiA9IE5cbiAgICAgICAgICogIG4gKyBJID0gSVxuICAgICAgICAgKiAgMCArIG4gPSBuXG4gICAgICAgICAqICAwICsgMCA9IDBcbiAgICAgICAgICogIDAgKyBOID0gTlxuICAgICAgICAgKiAgMCArIEkgPSBJXG4gICAgICAgICAqICBOICsgbiA9IE5cbiAgICAgICAgICogIE4gKyAwID0gTlxuICAgICAgICAgKiAgTiArIE4gPSBOXG4gICAgICAgICAqICBOICsgSSA9IE5cbiAgICAgICAgICogIEkgKyBuID0gSVxuICAgICAgICAgKiAgSSArIDAgPSBJXG4gICAgICAgICAqICBJICsgTiA9IE5cbiAgICAgICAgICogIEkgKyBJID0gSVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBwbHVzIHRoZSB2YWx1ZSBvZlxuICAgICAgICAgKiBCaWdOdW1iZXIoeSwgYikuXG4gICAgICAgICAqL1xuICAgICAgICBQLnBsdXMgPSBQLmFkZCA9IGZ1bmN0aW9uICggeSwgYiApIHtcbiAgICAgICAgICAgIHZhciB0LFxuICAgICAgICAgICAgICAgIHggPSB0aGlzLFxuICAgICAgICAgICAgICAgIGEgPSB4LnM7XG5cbiAgICAgICAgICAgIGlkID0gMTI7XG4gICAgICAgICAgICB5ID0gbmV3IEJpZ051bWJlciggeSwgYiApO1xuICAgICAgICAgICAgYiA9IHkucztcblxuICAgICAgICAgICAgLy8gRWl0aGVyIE5hTj9cbiAgICAgICAgICAgIGlmICggIWEgfHwgIWIgKSByZXR1cm4gbmV3IEJpZ051bWJlcihOYU4pO1xuXG4gICAgICAgICAgICAvLyBTaWducyBkaWZmZXI/XG4gICAgICAgICAgICAgaWYgKCBhICE9IGIgKSB7XG4gICAgICAgICAgICAgICAgeS5zID0gLWI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHgubWludXMoeSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB4ZSA9IHguZSAvIExPR19CQVNFLFxuICAgICAgICAgICAgICAgIHllID0geS5lIC8gTE9HX0JBU0UsXG4gICAgICAgICAgICAgICAgeGMgPSB4LmMsXG4gICAgICAgICAgICAgICAgeWMgPSB5LmM7XG5cbiAgICAgICAgICAgIGlmICggIXhlIHx8ICF5ZSApIHtcblxuICAgICAgICAgICAgICAgIC8vIFJldHVybiDCsUluZmluaXR5IGlmIGVpdGhlciDCsUluZmluaXR5LlxuICAgICAgICAgICAgICAgIGlmICggIXhjIHx8ICF5YyApIHJldHVybiBuZXcgQmlnTnVtYmVyKCBhIC8gMCApO1xuXG4gICAgICAgICAgICAgICAgLy8gRWl0aGVyIHplcm8/XG4gICAgICAgICAgICAgICAgLy8gUmV0dXJuIHkgaWYgeSBpcyBub24temVybywgeCBpZiB4IGlzIG5vbi16ZXJvLCBvciB6ZXJvIGlmIGJvdGggYXJlIHplcm8uXG4gICAgICAgICAgICAgICAgaWYgKCAheGNbMF0gfHwgIXljWzBdICkgcmV0dXJuIHljWzBdID8geSA6IG5ldyBCaWdOdW1iZXIoIHhjWzBdID8geCA6IGEgKiAwICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHhlID0gYml0Rmxvb3IoeGUpO1xuICAgICAgICAgICAgeWUgPSBiaXRGbG9vcih5ZSk7XG4gICAgICAgICAgICB4YyA9IHhjLnNsaWNlKCk7XG5cbiAgICAgICAgICAgIC8vIFByZXBlbmQgemVyb3MgdG8gZXF1YWxpc2UgZXhwb25lbnRzLiBGYXN0ZXIgdG8gdXNlIHJldmVyc2UgdGhlbiBkbyB1bnNoaWZ0cy5cbiAgICAgICAgICAgIGlmICggYSA9IHhlIC0geWUgKSB7XG4gICAgICAgICAgICAgICAgaWYgKCBhID4gMCApIHtcbiAgICAgICAgICAgICAgICAgICAgeWUgPSB4ZTtcbiAgICAgICAgICAgICAgICAgICAgdCA9IHljO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGEgPSAtYTtcbiAgICAgICAgICAgICAgICAgICAgdCA9IHhjO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHQucmV2ZXJzZSgpO1xuICAgICAgICAgICAgICAgIGZvciAoIDsgYS0tOyB0LnB1c2goMCkgKTtcbiAgICAgICAgICAgICAgICB0LnJldmVyc2UoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYSA9IHhjLmxlbmd0aDtcbiAgICAgICAgICAgIGIgPSB5Yy5sZW5ndGg7XG5cbiAgICAgICAgICAgIC8vIFBvaW50IHhjIHRvIHRoZSBsb25nZXIgYXJyYXksIGFuZCBiIHRvIHRoZSBzaG9ydGVyIGxlbmd0aC5cbiAgICAgICAgICAgIGlmICggYSAtIGIgPCAwICkgdCA9IHljLCB5YyA9IHhjLCB4YyA9IHQsIGIgPSBhO1xuXG4gICAgICAgICAgICAvLyBPbmx5IHN0YXJ0IGFkZGluZyBhdCB5Yy5sZW5ndGggLSAxIGFzIHRoZSBmdXJ0aGVyIGRpZ2l0cyBvZiB4YyBjYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgIGZvciAoIGEgPSAwOyBiOyApIHtcbiAgICAgICAgICAgICAgICBhID0gKCB4Y1stLWJdID0geGNbYl0gKyB5Y1tiXSArIGEgKSAvIEJBU0UgfCAwO1xuICAgICAgICAgICAgICAgIHhjW2JdICU9IEJBU0U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhKSB7XG4gICAgICAgICAgICAgICAgeGMudW5zaGlmdChhKTtcbiAgICAgICAgICAgICAgICArK3llO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyBuZWVkIHRvIGNoZWNrIGZvciB6ZXJvLCBhcyAreCArICt5ICE9IDAgJiYgLXggKyAteSAhPSAwXG4gICAgICAgICAgICAvLyB5ZSA9IE1BWF9FWFAgKyAxIHBvc3NpYmxlXG4gICAgICAgICAgICByZXR1cm4gbm9ybWFsaXNlKCB5LCB4YywgeWUgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0aGUgbnVtYmVyIG9mIHNpZ25pZmljYW50IGRpZ2l0cyBvZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIuXG4gICAgICAgICAqXG4gICAgICAgICAqIFt6XSB7Ym9vbGVhbnxudW1iZXJ9IFdoZXRoZXIgdG8gY291bnQgaW50ZWdlci1wYXJ0IHRyYWlsaW5nIHplcm9zOiB0cnVlLCBmYWxzZSwgMSBvciAwLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5wcmVjaXNpb24gPSBQLnNkID0gZnVuY3Rpb24gKHopIHtcbiAgICAgICAgICAgIHZhciBuLCB2LFxuICAgICAgICAgICAgICAgIHggPSB0aGlzLFxuICAgICAgICAgICAgICAgIGMgPSB4LmM7XG5cbiAgICAgICAgICAgIC8vICdwcmVjaXNpb24oKSBhcmd1bWVudCBub3QgYSBib29sZWFuIG9yIGJpbmFyeSBkaWdpdDoge3p9J1xuICAgICAgICAgICAgaWYgKCB6ICE9IG51bGwgJiYgeiAhPT0gISF6ICYmIHogIT09IDEgJiYgeiAhPT0gMCApIHtcbiAgICAgICAgICAgICAgICBpZiAoRVJST1JTKSByYWlzZSggMTMsICdhcmd1bWVudCcgKyBub3RCb29sLCB6ICk7XG4gICAgICAgICAgICAgICAgaWYgKCB6ICE9ICEheiApIHogPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoICFjICkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB2ID0gYy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgbiA9IHYgKiBMT0dfQkFTRSArIDE7XG5cbiAgICAgICAgICAgIGlmICggdiA9IGNbdl0gKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBTdWJ0cmFjdCB0aGUgbnVtYmVyIG9mIHRyYWlsaW5nIHplcm9zIG9mIHRoZSBsYXN0IGVsZW1lbnQuXG4gICAgICAgICAgICAgICAgZm9yICggOyB2ICUgMTAgPT0gMDsgdiAvPSAxMCwgbi0tICk7XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgdGhlIG51bWJlciBvZiBkaWdpdHMgb2YgdGhlIGZpcnN0IGVsZW1lbnQuXG4gICAgICAgICAgICAgICAgZm9yICggdiA9IGNbMF07IHYgPj0gMTA7IHYgLz0gMTAsIG4rKyApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIHogJiYgeC5lICsgMSA+IG4gKSBuID0geC5lICsgMTtcblxuICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciByb3VuZGVkIHRvIGEgbWF4aW11bSBvZlxuICAgICAgICAgKiBkcCBkZWNpbWFsIHBsYWNlcyB1c2luZyByb3VuZGluZyBtb2RlIHJtLCBvciB0byAwIGFuZCBST1VORElOR19NT0RFIHJlc3BlY3RpdmVseSBpZlxuICAgICAgICAgKiBvbWl0dGVkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBbZHBdIHtudW1iZXJ9IERlY2ltYWwgcGxhY2VzLiBJbnRlZ2VyLCAwIHRvIE1BWCBpbmNsdXNpdmUuXG4gICAgICAgICAqIFtybV0ge251bWJlcn0gUm91bmRpbmcgbW9kZS4gSW50ZWdlciwgMCB0byA4IGluY2x1c2l2ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3JvdW5kKCkgZGVjaW1hbCBwbGFjZXMgb3V0IG9mIHJhbmdlOiB7ZHB9J1xuICAgICAgICAgKiAncm91bmQoKSBkZWNpbWFsIHBsYWNlcyBub3QgYW4gaW50ZWdlcjoge2RwfSdcbiAgICAgICAgICogJ3JvdW5kKCkgcm91bmRpbmcgbW9kZSBub3QgYW4gaW50ZWdlcjoge3JtfSdcbiAgICAgICAgICogJ3JvdW5kKCkgcm91bmRpbmcgbW9kZSBvdXQgb2YgcmFuZ2U6IHtybX0nXG4gICAgICAgICAqL1xuICAgICAgICBQLnJvdW5kID0gZnVuY3Rpb24gKCBkcCwgcm0gKSB7XG4gICAgICAgICAgICB2YXIgbiA9IG5ldyBCaWdOdW1iZXIodGhpcyk7XG5cbiAgICAgICAgICAgIGlmICggZHAgPT0gbnVsbCB8fCBpc1ZhbGlkSW50KCBkcCwgMCwgTUFYLCAxNSApICkge1xuICAgICAgICAgICAgICAgIHJvdW5kKCBuLCB+fmRwICsgdGhpcy5lICsgMSwgcm0gPT0gbnVsbCB8fFxuICAgICAgICAgICAgICAgICAgIWlzVmFsaWRJbnQoIHJtLCAwLCA4LCAxNSwgcm91bmRpbmdNb2RlICkgPyBST1VORElOR19NT0RFIDogcm0gfCAwICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgc2hpZnRlZCBieSBrIHBsYWNlc1xuICAgICAgICAgKiAocG93ZXJzIG9mIDEwKS4gU2hpZnQgdG8gdGhlIHJpZ2h0IGlmIG4gPiAwLCBhbmQgdG8gdGhlIGxlZnQgaWYgbiA8IDAuXG4gICAgICAgICAqXG4gICAgICAgICAqIGsge251bWJlcn0gSW50ZWdlciwgLU1BWF9TQUZFX0lOVEVHRVIgdG8gTUFYX1NBRkVfSU5URUdFUiBpbmNsdXNpdmUuXG4gICAgICAgICAqXG4gICAgICAgICAqIElmIGsgaXMgb3V0IG9mIHJhbmdlIGFuZCBFUlJPUlMgaXMgZmFsc2UsIHRoZSByZXN1bHQgd2lsbCBiZSDCsTAgaWYgayA8IDAsIG9yIMKxSW5maW5pdHlcbiAgICAgICAgICogb3RoZXJ3aXNlLlxuICAgICAgICAgKlxuICAgICAgICAgKiAnc2hpZnQoKSBhcmd1bWVudCBub3QgYW4gaW50ZWdlcjoge2t9J1xuICAgICAgICAgKiAnc2hpZnQoKSBhcmd1bWVudCBvdXQgb2YgcmFuZ2U6IHtrfSdcbiAgICAgICAgICovXG4gICAgICAgIFAuc2hpZnQgPSBmdW5jdGlvbiAoaykge1xuICAgICAgICAgICAgdmFyIG4gPSB0aGlzO1xuICAgICAgICAgICAgcmV0dXJuIGlzVmFsaWRJbnQoIGssIC1NQVhfU0FGRV9JTlRFR0VSLCBNQVhfU0FGRV9JTlRFR0VSLCAxNiwgJ2FyZ3VtZW50JyApXG5cbiAgICAgICAgICAgICAgLy8gayA8IDFlKzIxLCBvciB0cnVuY2F0ZShrKSB3aWxsIHByb2R1Y2UgZXhwb25lbnRpYWwgbm90YXRpb24uXG4gICAgICAgICAgICAgID8gbi50aW1lcyggJzFlJyArIHRydW5jYXRlKGspIClcbiAgICAgICAgICAgICAgOiBuZXcgQmlnTnVtYmVyKCBuLmMgJiYgbi5jWzBdICYmICggayA8IC1NQVhfU0FGRV9JTlRFR0VSIHx8IGsgPiBNQVhfU0FGRV9JTlRFR0VSIClcbiAgICAgICAgICAgICAgICA/IG4ucyAqICggayA8IDAgPyAwIDogMSAvIDAgKVxuICAgICAgICAgICAgICAgIDogbiApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogIHNxcnQoLW4pID0gIE5cbiAgICAgICAgICogIHNxcnQoIE4pID0gIE5cbiAgICAgICAgICogIHNxcnQoLUkpID0gIE5cbiAgICAgICAgICogIHNxcnQoIEkpID0gIElcbiAgICAgICAgICogIHNxcnQoIDApID0gIDBcbiAgICAgICAgICogIHNxcnQoLTApID0gLTBcbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgc3F1YXJlIHJvb3Qgb2YgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyLFxuICAgICAgICAgKiByb3VuZGVkIGFjY29yZGluZyB0byBERUNJTUFMX1BMQUNFUyBhbmQgUk9VTkRJTkdfTU9ERS5cbiAgICAgICAgICovXG4gICAgICAgIFAuc3F1YXJlUm9vdCA9IFAuc3FydCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBtLCBuLCByLCByZXAsIHQsXG4gICAgICAgICAgICAgICAgeCA9IHRoaXMsXG4gICAgICAgICAgICAgICAgYyA9IHguYyxcbiAgICAgICAgICAgICAgICBzID0geC5zLFxuICAgICAgICAgICAgICAgIGUgPSB4LmUsXG4gICAgICAgICAgICAgICAgZHAgPSBERUNJTUFMX1BMQUNFUyArIDQsXG4gICAgICAgICAgICAgICAgaGFsZiA9IG5ldyBCaWdOdW1iZXIoJzAuNScpO1xuXG4gICAgICAgICAgICAvLyBOZWdhdGl2ZS9OYU4vSW5maW5pdHkvemVybz9cbiAgICAgICAgICAgIGlmICggcyAhPT0gMSB8fCAhYyB8fCAhY1swXSApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IEJpZ051bWJlciggIXMgfHwgcyA8IDAgJiYgKCAhYyB8fCBjWzBdICkgPyBOYU4gOiBjID8geCA6IDEgLyAwICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEluaXRpYWwgZXN0aW1hdGUuXG4gICAgICAgICAgICBzID0gTWF0aC5zcXJ0KCAreCApO1xuXG4gICAgICAgICAgICAvLyBNYXRoLnNxcnQgdW5kZXJmbG93L292ZXJmbG93P1xuICAgICAgICAgICAgLy8gUGFzcyB4IHRvIE1hdGguc3FydCBhcyBpbnRlZ2VyLCB0aGVuIGFkanVzdCB0aGUgZXhwb25lbnQgb2YgdGhlIHJlc3VsdC5cbiAgICAgICAgICAgIGlmICggcyA9PSAwIHx8IHMgPT0gMSAvIDAgKSB7XG4gICAgICAgICAgICAgICAgbiA9IGNvZWZmVG9TdHJpbmcoYyk7XG4gICAgICAgICAgICAgICAgaWYgKCAoIG4ubGVuZ3RoICsgZSApICUgMiA9PSAwICkgbiArPSAnMCc7XG4gICAgICAgICAgICAgICAgcyA9IE1hdGguc3FydChuKTtcbiAgICAgICAgICAgICAgICBlID0gYml0Rmxvb3IoICggZSArIDEgKSAvIDIgKSAtICggZSA8IDAgfHwgZSAlIDIgKTtcblxuICAgICAgICAgICAgICAgIGlmICggcyA9PSAxIC8gMCApIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9ICcxZScgKyBlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSBzLnRvRXhwb25lbnRpYWwoKTtcbiAgICAgICAgICAgICAgICAgICAgbiA9IG4uc2xpY2UoIDAsIG4uaW5kZXhPZignZScpICsgMSApICsgZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByID0gbmV3IEJpZ051bWJlcihuKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgciA9IG5ldyBCaWdOdW1iZXIoIHMgKyAnJyApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgemVyby5cbiAgICAgICAgICAgIC8vIHIgY291bGQgYmUgemVybyBpZiBNSU5fRVhQIGlzIGNoYW5nZWQgYWZ0ZXIgdGhlIHRoaXMgdmFsdWUgd2FzIGNyZWF0ZWQuXG4gICAgICAgICAgICAvLyBUaGlzIHdvdWxkIGNhdXNlIGEgZGl2aXNpb24gYnkgemVybyAoeC90KSBhbmQgaGVuY2UgSW5maW5pdHkgYmVsb3csIHdoaWNoIHdvdWxkIGNhdXNlXG4gICAgICAgICAgICAvLyBjb2VmZlRvU3RyaW5nIHRvIHRocm93LlxuICAgICAgICAgICAgaWYgKCByLmNbMF0gKSB7XG4gICAgICAgICAgICAgICAgZSA9IHIuZTtcbiAgICAgICAgICAgICAgICBzID0gZSArIGRwO1xuICAgICAgICAgICAgICAgIGlmICggcyA8IDMgKSBzID0gMDtcblxuICAgICAgICAgICAgICAgIC8vIE5ld3Rvbi1SYXBoc29uIGl0ZXJhdGlvbi5cbiAgICAgICAgICAgICAgICBmb3IgKCA7IDsgKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSByO1xuICAgICAgICAgICAgICAgICAgICByID0gaGFsZi50aW1lcyggdC5wbHVzKCBkaXYoIHgsIHQsIGRwLCAxICkgKSApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICggY29lZmZUb1N0cmluZyggdC5jICAgKS5zbGljZSggMCwgcyApID09PSAoIG4gPVxuICAgICAgICAgICAgICAgICAgICAgICAgIGNvZWZmVG9TdHJpbmcoIHIuYyApICkuc2xpY2UoIDAsIHMgKSApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGV4cG9uZW50IG9mIHIgbWF5IGhlcmUgYmUgb25lIGxlc3MgdGhhbiB0aGUgZmluYWwgcmVzdWx0IGV4cG9uZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZS5nIDAuMDAwOTk5OSAoZS00KSAtLT4gMC4wMDEgKGUtMyksIHNvIGFkanVzdCBzIHNvIHRoZSByb3VuZGluZyBkaWdpdHNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFyZSBpbmRleGVkIGNvcnJlY3RseS5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICggci5lIDwgZSApIC0tcztcbiAgICAgICAgICAgICAgICAgICAgICAgIG4gPSBuLnNsaWNlKCBzIC0gMywgcyArIDEgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlIDR0aCByb3VuZGluZyBkaWdpdCBtYXkgYmUgaW4gZXJyb3IgYnkgLTEgc28gaWYgdGhlIDQgcm91bmRpbmcgZGlnaXRzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhcmUgOTk5OSBvciA0OTk5IChpLmUuIGFwcHJvYWNoaW5nIGEgcm91bmRpbmcgYm91bmRhcnkpIGNvbnRpbnVlIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXRlcmF0aW9uLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBuID09ICc5OTk5JyB8fCAhcmVwICYmIG4gPT0gJzQ5OTknICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gT24gdGhlIGZpcnN0IGl0ZXJhdGlvbiBvbmx5LCBjaGVjayB0byBzZWUgaWYgcm91bmRpbmcgdXAgZ2l2ZXMgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZXhhY3QgcmVzdWx0IGFzIHRoZSBuaW5lcyBtYXkgaW5maW5pdGVseSByZXBlYXQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCAhcmVwICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3VuZCggdCwgdC5lICsgREVDSU1BTF9QTEFDRVMgKyAyLCAwICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCB0LnRpbWVzKHQpLmVxKHgpICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgciA9IHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRwICs9IDQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcyArPSA0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcCA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgcm91bmRpbmcgZGlnaXRzIGFyZSBudWxsLCAwezAsNH0gb3IgNTB7MCwzfSwgY2hlY2sgZm9yIGV4YWN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVzdWx0LiBJZiBub3QsIHRoZW4gdGhlcmUgYXJlIGZ1cnRoZXIgZGlnaXRzIGFuZCBtIHdpbGwgYmUgdHJ1dGh5LlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggIStuIHx8ICErbi5zbGljZSgxKSAmJiBuLmNoYXJBdCgwKSA9PSAnNScgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVHJ1bmNhdGUgdG8gdGhlIGZpcnN0IHJvdW5kaW5nIGRpZ2l0LlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3VuZCggciwgci5lICsgREVDSU1BTF9QTEFDRVMgKyAyLCAxICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG0gPSAhci50aW1lcyhyKS5lcSh4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJvdW5kKCByLCByLmUgKyBERUNJTUFMX1BMQUNFUyArIDEsIFJPVU5ESU5HX01PREUsIG0gKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqICBuICogMCA9IDBcbiAgICAgICAgICogIG4gKiBOID0gTlxuICAgICAgICAgKiAgbiAqIEkgPSBJXG4gICAgICAgICAqICAwICogbiA9IDBcbiAgICAgICAgICogIDAgKiAwID0gMFxuICAgICAgICAgKiAgMCAqIE4gPSBOXG4gICAgICAgICAqICAwICogSSA9IE5cbiAgICAgICAgICogIE4gKiBuID0gTlxuICAgICAgICAgKiAgTiAqIDAgPSBOXG4gICAgICAgICAqICBOICogTiA9IE5cbiAgICAgICAgICogIE4gKiBJID0gTlxuICAgICAgICAgKiAgSSAqIG4gPSBJXG4gICAgICAgICAqICBJICogMCA9IE5cbiAgICAgICAgICogIEkgKiBOID0gTlxuICAgICAgICAgKiAgSSAqIEkgPSBJXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIHRpbWVzIHRoZSB2YWx1ZSBvZlxuICAgICAgICAgKiBCaWdOdW1iZXIoeSwgYikuXG4gICAgICAgICAqL1xuICAgICAgICBQLnRpbWVzID0gUC5tdWwgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICB2YXIgYywgZSwgaSwgaiwgaywgbSwgeGNMLCB4bG8sIHhoaSwgeWNMLCB5bG8sIHloaSwgemMsXG4gICAgICAgICAgICAgICAgYmFzZSwgc3FydEJhc2UsXG4gICAgICAgICAgICAgICAgeCA9IHRoaXMsXG4gICAgICAgICAgICAgICAgeGMgPSB4LmMsXG4gICAgICAgICAgICAgICAgeWMgPSAoIGlkID0gMTcsIHkgPSBuZXcgQmlnTnVtYmVyKCB5LCBiICkgKS5jO1xuXG4gICAgICAgICAgICAvLyBFaXRoZXIgTmFOLCDCsUluZmluaXR5IG9yIMKxMD9cbiAgICAgICAgICAgIGlmICggIXhjIHx8ICF5YyB8fCAheGNbMF0gfHwgIXljWzBdICkge1xuXG4gICAgICAgICAgICAgICAgLy8gUmV0dXJuIE5hTiBpZiBlaXRoZXIgaXMgTmFOLCBvciBvbmUgaXMgMCBhbmQgdGhlIG90aGVyIGlzIEluZmluaXR5LlxuICAgICAgICAgICAgICAgIGlmICggIXgucyB8fCAheS5zIHx8IHhjICYmICF4Y1swXSAmJiAheWMgfHwgeWMgJiYgIXljWzBdICYmICF4YyApIHtcbiAgICAgICAgICAgICAgICAgICAgeS5jID0geS5lID0geS5zID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB5LnMgKj0geC5zO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJldHVybiDCsUluZmluaXR5IGlmIGVpdGhlciBpcyDCsUluZmluaXR5LlxuICAgICAgICAgICAgICAgICAgICBpZiAoICF4YyB8fCAheWMgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB5LmMgPSB5LmUgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJldHVybiDCsTAgaWYgZWl0aGVyIGlzIMKxMC5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHkuYyA9IFswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHkuZSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4geTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZSA9IGJpdEZsb29yKCB4LmUgLyBMT0dfQkFTRSApICsgYml0Rmxvb3IoIHkuZSAvIExPR19CQVNFICk7XG4gICAgICAgICAgICB5LnMgKj0geC5zO1xuICAgICAgICAgICAgeGNMID0geGMubGVuZ3RoO1xuICAgICAgICAgICAgeWNMID0geWMubGVuZ3RoO1xuXG4gICAgICAgICAgICAvLyBFbnN1cmUgeGMgcG9pbnRzIHRvIGxvbmdlciBhcnJheSBhbmQgeGNMIHRvIGl0cyBsZW5ndGguXG4gICAgICAgICAgICBpZiAoIHhjTCA8IHljTCApIHpjID0geGMsIHhjID0geWMsIHljID0gemMsIGkgPSB4Y0wsIHhjTCA9IHljTCwgeWNMID0gaTtcblxuICAgICAgICAgICAgLy8gSW5pdGlhbGlzZSB0aGUgcmVzdWx0IGFycmF5IHdpdGggemVyb3MuXG4gICAgICAgICAgICBmb3IgKCBpID0geGNMICsgeWNMLCB6YyA9IFtdOyBpLS07IHpjLnB1c2goMCkgKTtcblxuICAgICAgICAgICAgYmFzZSA9IEJBU0U7XG4gICAgICAgICAgICBzcXJ0QmFzZSA9IFNRUlRfQkFTRTtcblxuICAgICAgICAgICAgZm9yICggaSA9IHljTDsgLS1pID49IDA7ICkge1xuICAgICAgICAgICAgICAgIGMgPSAwO1xuICAgICAgICAgICAgICAgIHlsbyA9IHljW2ldICUgc3FydEJhc2U7XG4gICAgICAgICAgICAgICAgeWhpID0geWNbaV0gLyBzcXJ0QmFzZSB8IDA7XG5cbiAgICAgICAgICAgICAgICBmb3IgKCBrID0geGNMLCBqID0gaSArIGs7IGogPiBpOyApIHtcbiAgICAgICAgICAgICAgICAgICAgeGxvID0geGNbLS1rXSAlIHNxcnRCYXNlO1xuICAgICAgICAgICAgICAgICAgICB4aGkgPSB4Y1trXSAvIHNxcnRCYXNlIHwgMDtcbiAgICAgICAgICAgICAgICAgICAgbSA9IHloaSAqIHhsbyArIHhoaSAqIHlsbztcbiAgICAgICAgICAgICAgICAgICAgeGxvID0geWxvICogeGxvICsgKCAoIG0gJSBzcXJ0QmFzZSApICogc3FydEJhc2UgKSArIHpjW2pdICsgYztcbiAgICAgICAgICAgICAgICAgICAgYyA9ICggeGxvIC8gYmFzZSB8IDAgKSArICggbSAvIHNxcnRCYXNlIHwgMCApICsgeWhpICogeGhpO1xuICAgICAgICAgICAgICAgICAgICB6Y1tqLS1dID0geGxvICUgYmFzZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB6Y1tqXSA9IGM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgICAgICAgKytlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB6Yy5zaGlmdCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbm9ybWFsaXNlKCB5LCB6YywgZSApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgcm91bmRlZCB0byBhIG1heGltdW0gb2ZcbiAgICAgICAgICogc2Qgc2lnbmlmaWNhbnQgZGlnaXRzIHVzaW5nIHJvdW5kaW5nIG1vZGUgcm0sIG9yIFJPVU5ESU5HX01PREUgaWYgcm0gaXMgb21pdHRlZC5cbiAgICAgICAgICpcbiAgICAgICAgICogW3NkXSB7bnVtYmVyfSBTaWduaWZpY2FudCBkaWdpdHMuIEludGVnZXIsIDEgdG8gTUFYIGluY2x1c2l2ZS5cbiAgICAgICAgICogW3JtXSB7bnVtYmVyfSBSb3VuZGluZyBtb2RlLiBJbnRlZ2VyLCAwIHRvIDggaW5jbHVzaXZlLlxuICAgICAgICAgKlxuICAgICAgICAgKiAndG9EaWdpdHMoKSBwcmVjaXNpb24gb3V0IG9mIHJhbmdlOiB7c2R9J1xuICAgICAgICAgKiAndG9EaWdpdHMoKSBwcmVjaXNpb24gbm90IGFuIGludGVnZXI6IHtzZH0nXG4gICAgICAgICAqICd0b0RpZ2l0cygpIHJvdW5kaW5nIG1vZGUgbm90IGFuIGludGVnZXI6IHtybX0nXG4gICAgICAgICAqICd0b0RpZ2l0cygpIHJvdW5kaW5nIG1vZGUgb3V0IG9mIHJhbmdlOiB7cm19J1xuICAgICAgICAgKi9cbiAgICAgICAgUC50b0RpZ2l0cyA9IGZ1bmN0aW9uICggc2QsIHJtICkge1xuICAgICAgICAgICAgdmFyIG4gPSBuZXcgQmlnTnVtYmVyKHRoaXMpO1xuICAgICAgICAgICAgc2QgPSBzZCA9PSBudWxsIHx8ICFpc1ZhbGlkSW50KCBzZCwgMSwgTUFYLCAxOCwgJ3ByZWNpc2lvbicgKSA/IG51bGwgOiBzZCB8IDA7XG4gICAgICAgICAgICBybSA9IHJtID09IG51bGwgfHwgIWlzVmFsaWRJbnQoIHJtLCAwLCA4LCAxOCwgcm91bmRpbmdNb2RlICkgPyBST1VORElOR19NT0RFIDogcm0gfCAwO1xuICAgICAgICAgICAgcmV0dXJuIHNkID8gcm91bmQoIG4sIHNkLCBybSApIDogbjtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGluIGV4cG9uZW50aWFsIG5vdGF0aW9uIGFuZFxuICAgICAgICAgKiByb3VuZGVkIHVzaW5nIFJPVU5ESU5HX01PREUgdG8gZHAgZml4ZWQgZGVjaW1hbCBwbGFjZXMuXG4gICAgICAgICAqXG4gICAgICAgICAqIFtkcF0ge251bWJlcn0gRGVjaW1hbCBwbGFjZXMuIEludGVnZXIsIDAgdG8gTUFYIGluY2x1c2l2ZS5cbiAgICAgICAgICogW3JtXSB7bnVtYmVyfSBSb3VuZGluZyBtb2RlLiBJbnRlZ2VyLCAwIHRvIDggaW5jbHVzaXZlLlxuICAgICAgICAgKlxuICAgICAgICAgKiAndG9FeHBvbmVudGlhbCgpIGRlY2ltYWwgcGxhY2VzIG5vdCBhbiBpbnRlZ2VyOiB7ZHB9J1xuICAgICAgICAgKiAndG9FeHBvbmVudGlhbCgpIGRlY2ltYWwgcGxhY2VzIG91dCBvZiByYW5nZToge2RwfSdcbiAgICAgICAgICogJ3RvRXhwb25lbnRpYWwoKSByb3VuZGluZyBtb2RlIG5vdCBhbiBpbnRlZ2VyOiB7cm19J1xuICAgICAgICAgKiAndG9FeHBvbmVudGlhbCgpIHJvdW5kaW5nIG1vZGUgb3V0IG9mIHJhbmdlOiB7cm19J1xuICAgICAgICAgKi9cbiAgICAgICAgUC50b0V4cG9uZW50aWFsID0gZnVuY3Rpb24gKCBkcCwgcm0gKSB7XG4gICAgICAgICAgICByZXR1cm4gZm9ybWF0KCB0aGlzLFxuICAgICAgICAgICAgICBkcCAhPSBudWxsICYmIGlzVmFsaWRJbnQoIGRwLCAwLCBNQVgsIDE5ICkgPyB+fmRwICsgMSA6IG51bGwsIHJtLCAxOSApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaW4gZml4ZWQtcG9pbnQgbm90YXRpb24gcm91bmRpbmdcbiAgICAgICAgICogdG8gZHAgZml4ZWQgZGVjaW1hbCBwbGFjZXMgdXNpbmcgcm91bmRpbmcgbW9kZSBybSwgb3IgUk9VTkRJTkdfTU9ERSBpZiBybSBpcyBvbWl0dGVkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBOb3RlOiBhcyB3aXRoIEphdmFTY3JpcHQncyBudW1iZXIgdHlwZSwgKC0wKS50b0ZpeGVkKDApIGlzICcwJyxcbiAgICAgICAgICogYnV0IGUuZy4gKC0wLjAwMDAxKS50b0ZpeGVkKDApIGlzICctMCcuXG4gICAgICAgICAqXG4gICAgICAgICAqIFtkcF0ge251bWJlcn0gRGVjaW1hbCBwbGFjZXMuIEludGVnZXIsIDAgdG8gTUFYIGluY2x1c2l2ZS5cbiAgICAgICAgICogW3JtXSB7bnVtYmVyfSBSb3VuZGluZyBtb2RlLiBJbnRlZ2VyLCAwIHRvIDggaW5jbHVzaXZlLlxuICAgICAgICAgKlxuICAgICAgICAgKiAndG9GaXhlZCgpIGRlY2ltYWwgcGxhY2VzIG5vdCBhbiBpbnRlZ2VyOiB7ZHB9J1xuICAgICAgICAgKiAndG9GaXhlZCgpIGRlY2ltYWwgcGxhY2VzIG91dCBvZiByYW5nZToge2RwfSdcbiAgICAgICAgICogJ3RvRml4ZWQoKSByb3VuZGluZyBtb2RlIG5vdCBhbiBpbnRlZ2VyOiB7cm19J1xuICAgICAgICAgKiAndG9GaXhlZCgpIHJvdW5kaW5nIG1vZGUgb3V0IG9mIHJhbmdlOiB7cm19J1xuICAgICAgICAgKi9cbiAgICAgICAgUC50b0ZpeGVkID0gZnVuY3Rpb24gKCBkcCwgcm0gKSB7XG4gICAgICAgICAgICByZXR1cm4gZm9ybWF0KCB0aGlzLCBkcCAhPSBudWxsICYmIGlzVmFsaWRJbnQoIGRwLCAwLCBNQVgsIDIwIClcbiAgICAgICAgICAgICAgPyB+fmRwICsgdGhpcy5lICsgMSA6IG51bGwsIHJtLCAyMCApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaW4gZml4ZWQtcG9pbnQgbm90YXRpb24gcm91bmRlZFxuICAgICAgICAgKiB1c2luZyBybSBvciBST1VORElOR19NT0RFIHRvIGRwIGRlY2ltYWwgcGxhY2VzLCBhbmQgZm9ybWF0dGVkIGFjY29yZGluZyB0byB0aGUgcHJvcGVydGllc1xuICAgICAgICAgKiBvZiB0aGUgRk9STUFUIG9iamVjdCAoc2VlIEJpZ051bWJlci5jb25maWcpLlxuICAgICAgICAgKlxuICAgICAgICAgKiBGT1JNQVQgPSB7XG4gICAgICAgICAqICAgICAgZGVjaW1hbFNlcGFyYXRvciA6ICcuJyxcbiAgICAgICAgICogICAgICBncm91cFNlcGFyYXRvciA6ICcsJyxcbiAgICAgICAgICogICAgICBncm91cFNpemUgOiAzLFxuICAgICAgICAgKiAgICAgIHNlY29uZGFyeUdyb3VwU2l6ZSA6IDAsXG4gICAgICAgICAqICAgICAgZnJhY3Rpb25Hcm91cFNlcGFyYXRvciA6ICdcXHhBMCcsICAgIC8vIG5vbi1icmVha2luZyBzcGFjZVxuICAgICAgICAgKiAgICAgIGZyYWN0aW9uR3JvdXBTaXplIDogMFxuICAgICAgICAgKiB9O1xuICAgICAgICAgKlxuICAgICAgICAgKiBbZHBdIHtudW1iZXJ9IERlY2ltYWwgcGxhY2VzLiBJbnRlZ2VyLCAwIHRvIE1BWCBpbmNsdXNpdmUuXG4gICAgICAgICAqIFtybV0ge251bWJlcn0gUm91bmRpbmcgbW9kZS4gSW50ZWdlciwgMCB0byA4IGluY2x1c2l2ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3RvRm9ybWF0KCkgZGVjaW1hbCBwbGFjZXMgbm90IGFuIGludGVnZXI6IHtkcH0nXG4gICAgICAgICAqICd0b0Zvcm1hdCgpIGRlY2ltYWwgcGxhY2VzIG91dCBvZiByYW5nZToge2RwfSdcbiAgICAgICAgICogJ3RvRm9ybWF0KCkgcm91bmRpbmcgbW9kZSBub3QgYW4gaW50ZWdlcjoge3JtfSdcbiAgICAgICAgICogJ3RvRm9ybWF0KCkgcm91bmRpbmcgbW9kZSBvdXQgb2YgcmFuZ2U6IHtybX0nXG4gICAgICAgICAqL1xuICAgICAgICBQLnRvRm9ybWF0ID0gZnVuY3Rpb24gKCBkcCwgcm0gKSB7XG4gICAgICAgICAgICB2YXIgc3RyID0gZm9ybWF0KCB0aGlzLCBkcCAhPSBudWxsICYmIGlzVmFsaWRJbnQoIGRwLCAwLCBNQVgsIDIxIClcbiAgICAgICAgICAgICAgPyB+fmRwICsgdGhpcy5lICsgMSA6IG51bGwsIHJtLCAyMSApO1xuXG4gICAgICAgICAgICBpZiAoIHRoaXMuYyApIHtcbiAgICAgICAgICAgICAgICB2YXIgaSxcbiAgICAgICAgICAgICAgICAgICAgYXJyID0gc3RyLnNwbGl0KCcuJyksXG4gICAgICAgICAgICAgICAgICAgIGcxID0gK0ZPUk1BVC5ncm91cFNpemUsXG4gICAgICAgICAgICAgICAgICAgIGcyID0gK0ZPUk1BVC5zZWNvbmRhcnlHcm91cFNpemUsXG4gICAgICAgICAgICAgICAgICAgIGdyb3VwU2VwYXJhdG9yID0gRk9STUFULmdyb3VwU2VwYXJhdG9yLFxuICAgICAgICAgICAgICAgICAgICBpbnRQYXJ0ID0gYXJyWzBdLFxuICAgICAgICAgICAgICAgICAgICBmcmFjdGlvblBhcnQgPSBhcnJbMV0sXG4gICAgICAgICAgICAgICAgICAgIGlzTmVnID0gdGhpcy5zIDwgMCxcbiAgICAgICAgICAgICAgICAgICAgaW50RGlnaXRzID0gaXNOZWcgPyBpbnRQYXJ0LnNsaWNlKDEpIDogaW50UGFydCxcbiAgICAgICAgICAgICAgICAgICAgbGVuID0gaW50RGlnaXRzLmxlbmd0aDtcblxuICAgICAgICAgICAgICAgIGlmIChnMikgaSA9IGcxLCBnMSA9IGcyLCBnMiA9IGksIGxlbiAtPSBpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCBnMSA+IDAgJiYgbGVuID4gMCApIHtcbiAgICAgICAgICAgICAgICAgICAgaSA9IGxlbiAlIGcxIHx8IGcxO1xuICAgICAgICAgICAgICAgICAgICBpbnRQYXJ0ID0gaW50RGlnaXRzLnN1YnN0ciggMCwgaSApO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIDsgaSA8IGxlbjsgaSArPSBnMSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludFBhcnQgKz0gZ3JvdXBTZXBhcmF0b3IgKyBpbnREaWdpdHMuc3Vic3RyKCBpLCBnMSApO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBnMiA+IDAgKSBpbnRQYXJ0ICs9IGdyb3VwU2VwYXJhdG9yICsgaW50RGlnaXRzLnNsaWNlKGkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNOZWcpIGludFBhcnQgPSAnLScgKyBpbnRQYXJ0O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN0ciA9IGZyYWN0aW9uUGFydFxuICAgICAgICAgICAgICAgICAgPyBpbnRQYXJ0ICsgRk9STUFULmRlY2ltYWxTZXBhcmF0b3IgKyAoICggZzIgPSArRk9STUFULmZyYWN0aW9uR3JvdXBTaXplIClcbiAgICAgICAgICAgICAgICAgICAgPyBmcmFjdGlvblBhcnQucmVwbGFjZSggbmV3IFJlZ0V4cCggJ1xcXFxkeycgKyBnMiArICd9XFxcXEInLCAnZycgKSxcbiAgICAgICAgICAgICAgICAgICAgICAnJCYnICsgRk9STUFULmZyYWN0aW9uR3JvdXBTZXBhcmF0b3IgKVxuICAgICAgICAgICAgICAgICAgICA6IGZyYWN0aW9uUGFydCApXG4gICAgICAgICAgICAgICAgICA6IGludFBhcnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBzdHJpbmcgYXJyYXkgcmVwcmVzZW50aW5nIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBhcyBhIHNpbXBsZSBmcmFjdGlvbiB3aXRoXG4gICAgICAgICAqIGFuIGludGVnZXIgbnVtZXJhdG9yIGFuZCBhbiBpbnRlZ2VyIGRlbm9taW5hdG9yLiBUaGUgZGVub21pbmF0b3Igd2lsbCBiZSBhIHBvc2l0aXZlXG4gICAgICAgICAqIG5vbi16ZXJvIHZhbHVlIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgc3BlY2lmaWVkIG1heGltdW0gZGVub21pbmF0b3IuIElmIGEgbWF4aW11bVxuICAgICAgICAgKiBkZW5vbWluYXRvciBpcyBub3Qgc3BlY2lmaWVkLCB0aGUgZGVub21pbmF0b3Igd2lsbCBiZSB0aGUgbG93ZXN0IHZhbHVlIG5lY2Vzc2FyeSB0b1xuICAgICAgICAgKiByZXByZXNlbnQgdGhlIG51bWJlciBleGFjdGx5LlxuICAgICAgICAgKlxuICAgICAgICAgKiBbbWRdIHtudW1iZXJ8c3RyaW5nfEJpZ051bWJlcn0gSW50ZWdlciA+PSAxIGFuZCA8IEluZmluaXR5LiBUaGUgbWF4aW11bSBkZW5vbWluYXRvci5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3RvRnJhY3Rpb24oKSBtYXggZGVub21pbmF0b3Igbm90IGFuIGludGVnZXI6IHttZH0nXG4gICAgICAgICAqICd0b0ZyYWN0aW9uKCkgbWF4IGRlbm9taW5hdG9yIG91dCBvZiByYW5nZToge21kfSdcbiAgICAgICAgICovXG4gICAgICAgIFAudG9GcmFjdGlvbiA9IGZ1bmN0aW9uIChtZCkge1xuICAgICAgICAgICAgdmFyIGFyciwgZDAsIGQyLCBlLCBleHAsIG4sIG4wLCBxLCBzLFxuICAgICAgICAgICAgICAgIGsgPSBFUlJPUlMsXG4gICAgICAgICAgICAgICAgeCA9IHRoaXMsXG4gICAgICAgICAgICAgICAgeGMgPSB4LmMsXG4gICAgICAgICAgICAgICAgZCA9IG5ldyBCaWdOdW1iZXIoT05FKSxcbiAgICAgICAgICAgICAgICBuMSA9IGQwID0gbmV3IEJpZ051bWJlcihPTkUpLFxuICAgICAgICAgICAgICAgIGQxID0gbjAgPSBuZXcgQmlnTnVtYmVyKE9ORSk7XG5cbiAgICAgICAgICAgIGlmICggbWQgIT0gbnVsbCApIHtcbiAgICAgICAgICAgICAgICBFUlJPUlMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBuID0gbmV3IEJpZ051bWJlcihtZCk7XG4gICAgICAgICAgICAgICAgRVJST1JTID0gaztcblxuICAgICAgICAgICAgICAgIGlmICggISggayA9IG4uaXNJbnQoKSApIHx8IG4ubHQoT05FKSApIHtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoRVJST1JTKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByYWlzZSggMjIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICdtYXggZGVub21pbmF0b3IgJyArICggayA/ICdvdXQgb2YgcmFuZ2UnIDogJ25vdCBhbiBpbnRlZ2VyJyApLCBtZCApO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRVJST1JTIGlzIGZhbHNlOlxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBtZCBpcyBhIGZpbml0ZSBub24taW50ZWdlciA+PSAxLCByb3VuZCBpdCB0byBhbiBpbnRlZ2VyIGFuZCB1c2UgaXQuXG4gICAgICAgICAgICAgICAgICAgIG1kID0gIWsgJiYgbi5jICYmIHJvdW5kKCBuLCBuLmUgKyAxLCAxICkuZ3RlKE9ORSkgPyBuIDogbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICggIXhjICkgcmV0dXJuIHgudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHMgPSBjb2VmZlRvU3RyaW5nKHhjKTtcblxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGluaXRpYWwgZGVub21pbmF0b3IuXG4gICAgICAgICAgICAvLyBkIGlzIGEgcG93ZXIgb2YgMTAgYW5kIHRoZSBtaW5pbXVtIG1heCBkZW5vbWluYXRvciB0aGF0IHNwZWNpZmllcyB0aGUgdmFsdWUgZXhhY3RseS5cbiAgICAgICAgICAgIGUgPSBkLmUgPSBzLmxlbmd0aCAtIHguZSAtIDE7XG4gICAgICAgICAgICBkLmNbMF0gPSBQT1dTX1RFTlsgKCBleHAgPSBlICUgTE9HX0JBU0UgKSA8IDAgPyBMT0dfQkFTRSArIGV4cCA6IGV4cCBdO1xuICAgICAgICAgICAgbWQgPSAhbWQgfHwgbi5jbXAoZCkgPiAwID8gKCBlID4gMCA/IGQgOiBuMSApIDogbjtcblxuICAgICAgICAgICAgZXhwID0gTUFYX0VYUDtcbiAgICAgICAgICAgIE1BWF9FWFAgPSAxIC8gMDtcbiAgICAgICAgICAgIG4gPSBuZXcgQmlnTnVtYmVyKHMpO1xuXG4gICAgICAgICAgICAvLyBuMCA9IGQxID0gMFxuICAgICAgICAgICAgbjAuY1swXSA9IDA7XG5cbiAgICAgICAgICAgIGZvciAoIDsgOyApICB7XG4gICAgICAgICAgICAgICAgcSA9IGRpdiggbiwgZCwgMCwgMSApO1xuICAgICAgICAgICAgICAgIGQyID0gZDAucGx1cyggcS50aW1lcyhkMSkgKTtcbiAgICAgICAgICAgICAgICBpZiAoIGQyLmNtcChtZCkgPT0gMSApIGJyZWFrO1xuICAgICAgICAgICAgICAgIGQwID0gZDE7XG4gICAgICAgICAgICAgICAgZDEgPSBkMjtcbiAgICAgICAgICAgICAgICBuMSA9IG4wLnBsdXMoIHEudGltZXMoIGQyID0gbjEgKSApO1xuICAgICAgICAgICAgICAgIG4wID0gZDI7XG4gICAgICAgICAgICAgICAgZCA9IG4ubWludXMoIHEudGltZXMoIGQyID0gZCApICk7XG4gICAgICAgICAgICAgICAgbiA9IGQyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkMiA9IGRpdiggbWQubWludXMoZDApLCBkMSwgMCwgMSApO1xuICAgICAgICAgICAgbjAgPSBuMC5wbHVzKCBkMi50aW1lcyhuMSkgKTtcbiAgICAgICAgICAgIGQwID0gZDAucGx1cyggZDIudGltZXMoZDEpICk7XG4gICAgICAgICAgICBuMC5zID0gbjEucyA9IHgucztcbiAgICAgICAgICAgIGUgKj0gMjtcblxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGZyYWN0aW9uIGlzIGNsb3NlciB0byB4LCBuMC9kMCBvciBuMS9kMVxuICAgICAgICAgICAgYXJyID0gZGl2KCBuMSwgZDEsIGUsIFJPVU5ESU5HX01PREUgKS5taW51cyh4KS5hYnMoKS5jbXAoXG4gICAgICAgICAgICAgICAgICBkaXYoIG4wLCBkMCwgZSwgUk9VTkRJTkdfTU9ERSApLm1pbnVzKHgpLmFicygpICkgPCAxXG4gICAgICAgICAgICAgICAgICAgID8gWyBuMS50b1N0cmluZygpLCBkMS50b1N0cmluZygpIF1cbiAgICAgICAgICAgICAgICAgICAgOiBbIG4wLnRvU3RyaW5nKCksIGQwLnRvU3RyaW5nKCkgXTtcblxuICAgICAgICAgICAgTUFYX0VYUCA9IGV4cDtcbiAgICAgICAgICAgIHJldHVybiBhcnI7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGNvbnZlcnRlZCB0byBhIG51bWJlciBwcmltaXRpdmUuXG4gICAgICAgICAqL1xuICAgICAgICBQLnRvTnVtYmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHggPSB0aGlzO1xuXG4gICAgICAgICAgICAvLyBFbnN1cmUgemVybyBoYXMgY29ycmVjdCBzaWduLlxuICAgICAgICAgICAgcmV0dXJuICt4IHx8ICggeC5zID8geC5zICogMCA6IE5hTiApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciByYWlzZWQgdG8gdGhlIHBvd2VyIG4uXG4gICAgICAgICAqIElmIG4gaXMgbmVnYXRpdmUgcm91bmQgYWNjb3JkaW5nIHRvIERFQ0lNQUxfUExBQ0VTIGFuZCBST1VORElOR19NT0RFLlxuICAgICAgICAgKiBJZiBQT1dfUFJFQ0lTSU9OIGlzIG5vdCAwLCByb3VuZCB0byBQT1dfUFJFQ0lTSU9OIHVzaW5nIFJPVU5ESU5HX01PREUuXG4gICAgICAgICAqXG4gICAgICAgICAqIG4ge251bWJlcn0gSW50ZWdlciwgLTkwMDcxOTkyNTQ3NDA5OTIgdG8gOTAwNzE5OTI1NDc0MDk5MiBpbmNsdXNpdmUuXG4gICAgICAgICAqIChQZXJmb3JtcyA1NCBsb29wIGl0ZXJhdGlvbnMgZm9yIG4gb2YgOTAwNzE5OTI1NDc0MDk5Mi4pXG4gICAgICAgICAqXG4gICAgICAgICAqICdwb3coKSBleHBvbmVudCBub3QgYW4gaW50ZWdlcjoge259J1xuICAgICAgICAgKiAncG93KCkgZXhwb25lbnQgb3V0IG9mIHJhbmdlOiB7bn0nXG4gICAgICAgICAqL1xuICAgICAgICBQLnRvUG93ZXIgPSBQLnBvdyA9IGZ1bmN0aW9uIChuKSB7XG4gICAgICAgICAgICB2YXIgaywgeSxcbiAgICAgICAgICAgICAgICBpID0gbWF0aGZsb29yKCBuIDwgMCA/IC1uIDogK24gKSxcbiAgICAgICAgICAgICAgICB4ID0gdGhpcztcblxuICAgICAgICAgICAgLy8gUGFzcyDCsUluZmluaXR5IHRvIE1hdGgucG93IGlmIGV4cG9uZW50IGlzIG91dCBvZiByYW5nZS5cbiAgICAgICAgICAgIGlmICggIWlzVmFsaWRJbnQoIG4sIC1NQVhfU0FGRV9JTlRFR0VSLCBNQVhfU0FGRV9JTlRFR0VSLCAyMywgJ2V4cG9uZW50JyApICYmXG4gICAgICAgICAgICAgICggIWlzRmluaXRlKG4pIHx8IGkgPiBNQVhfU0FGRV9JTlRFR0VSICYmICggbiAvPSAwICkgfHxcbiAgICAgICAgICAgICAgICBwYXJzZUZsb2F0KG4pICE9IG4gJiYgISggbiA9IE5hTiApICkgKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBCaWdOdW1iZXIoIE1hdGgucG93KCAreCwgbiApICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRydW5jYXRpbmcgZWFjaCBjb2VmZmljaWVudCBhcnJheSB0byBhIGxlbmd0aCBvZiBrIGFmdGVyIGVhY2ggbXVsdGlwbGljYXRpb24gZXF1YXRlc1xuICAgICAgICAgICAgLy8gdG8gdHJ1bmNhdGluZyBzaWduaWZpY2FudCBkaWdpdHMgdG8gUE9XX1BSRUNJU0lPTiArIFsyOCwgNDFdLCBpLmUuIHRoZXJlIHdpbGwgYmUgYVxuICAgICAgICAgICAgLy8gbWluaW11bSBvZiAyOCBndWFyZCBkaWdpdHMgcmV0YWluZWQuIChVc2luZyArIDEuNSB3b3VsZCBnaXZlIFs5LCAyMV0gZ3VhcmQgZGlnaXRzLilcbiAgICAgICAgICAgIGsgPSBQT1dfUFJFQ0lTSU9OID8gbWF0aGNlaWwoIFBPV19QUkVDSVNJT04gLyBMT0dfQkFTRSArIDIgKSA6IDA7XG4gICAgICAgICAgICB5ID0gbmV3IEJpZ051bWJlcihPTkUpO1xuXG4gICAgICAgICAgICBmb3IgKCA7IDsgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIGkgJSAyICkge1xuICAgICAgICAgICAgICAgICAgICB5ID0geS50aW1lcyh4KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCAheS5jICkgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGlmICggayAmJiB5LmMubGVuZ3RoID4gayApIHkuYy5sZW5ndGggPSBrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGkgPSBtYXRoZmxvb3IoIGkgLyAyICk7XG4gICAgICAgICAgICAgICAgaWYgKCAhaSApIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgeCA9IHgudGltZXMoeCk7XG4gICAgICAgICAgICAgICAgaWYgKCBrICYmIHguYyAmJiB4LmMubGVuZ3RoID4gayApIHguYy5sZW5ndGggPSBrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIG4gPCAwICkgeSA9IE9ORS5kaXYoeSk7XG4gICAgICAgICAgICByZXR1cm4gayA/IHJvdW5kKCB5LCBQT1dfUFJFQ0lTSU9OLCBST1VORElOR19NT0RFICkgOiB5O1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgcm91bmRlZCB0byBzZCBzaWduaWZpY2FudCBkaWdpdHNcbiAgICAgICAgICogdXNpbmcgcm91bmRpbmcgbW9kZSBybSBvciBST1VORElOR19NT0RFLiBJZiBzZCBpcyBsZXNzIHRoYW4gdGhlIG51bWJlciBvZiBkaWdpdHNcbiAgICAgICAgICogbmVjZXNzYXJ5IHRvIHJlcHJlc2VudCB0aGUgaW50ZWdlciBwYXJ0IG9mIHRoZSB2YWx1ZSBpbiBmaXhlZC1wb2ludCBub3RhdGlvbiwgdGhlbiB1c2VcbiAgICAgICAgICogZXhwb25lbnRpYWwgbm90YXRpb24uXG4gICAgICAgICAqXG4gICAgICAgICAqIFtzZF0ge251bWJlcn0gU2lnbmlmaWNhbnQgZGlnaXRzLiBJbnRlZ2VyLCAxIHRvIE1BWCBpbmNsdXNpdmUuXG4gICAgICAgICAqIFtybV0ge251bWJlcn0gUm91bmRpbmcgbW9kZS4gSW50ZWdlciwgMCB0byA4IGluY2x1c2l2ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3RvUHJlY2lzaW9uKCkgcHJlY2lzaW9uIG5vdCBhbiBpbnRlZ2VyOiB7c2R9J1xuICAgICAgICAgKiAndG9QcmVjaXNpb24oKSBwcmVjaXNpb24gb3V0IG9mIHJhbmdlOiB7c2R9J1xuICAgICAgICAgKiAndG9QcmVjaXNpb24oKSByb3VuZGluZyBtb2RlIG5vdCBhbiBpbnRlZ2VyOiB7cm19J1xuICAgICAgICAgKiAndG9QcmVjaXNpb24oKSByb3VuZGluZyBtb2RlIG91dCBvZiByYW5nZToge3JtfSdcbiAgICAgICAgICovXG4gICAgICAgIFAudG9QcmVjaXNpb24gPSBmdW5jdGlvbiAoIHNkLCBybSApIHtcbiAgICAgICAgICAgIHJldHVybiBmb3JtYXQoIHRoaXMsIHNkICE9IG51bGwgJiYgaXNWYWxpZEludCggc2QsIDEsIE1BWCwgMjQsICdwcmVjaXNpb24nIClcbiAgICAgICAgICAgICAgPyBzZCB8IDAgOiBudWxsLCBybSwgMjQgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGluIGJhc2UgYiwgb3IgYmFzZSAxMCBpZiBiIGlzXG4gICAgICAgICAqIG9taXR0ZWQuIElmIGEgYmFzZSBpcyBzcGVjaWZpZWQsIGluY2x1ZGluZyBiYXNlIDEwLCByb3VuZCBhY2NvcmRpbmcgdG8gREVDSU1BTF9QTEFDRVMgYW5kXG4gICAgICAgICAqIFJPVU5ESU5HX01PREUuIElmIGEgYmFzZSBpcyBub3Qgc3BlY2lmaWVkLCBhbmQgdGhpcyBCaWdOdW1iZXIgaGFzIGEgcG9zaXRpdmUgZXhwb25lbnRcbiAgICAgICAgICogdGhhdCBpcyBlcXVhbCB0byBvciBncmVhdGVyIHRoYW4gVE9fRVhQX1BPUywgb3IgYSBuZWdhdGl2ZSBleHBvbmVudCBlcXVhbCB0byBvciBsZXNzIHRoYW5cbiAgICAgICAgICogVE9fRVhQX05FRywgcmV0dXJuIGV4cG9uZW50aWFsIG5vdGF0aW9uLlxuICAgICAgICAgKlxuICAgICAgICAgKiBbYl0ge251bWJlcn0gSW50ZWdlciwgMiB0byA2NCBpbmNsdXNpdmUuXG4gICAgICAgICAqXG4gICAgICAgICAqICd0b1N0cmluZygpIGJhc2Ugbm90IGFuIGludGVnZXI6IHtifSdcbiAgICAgICAgICogJ3RvU3RyaW5nKCkgYmFzZSBvdXQgb2YgcmFuZ2U6IHtifSdcbiAgICAgICAgICovXG4gICAgICAgIFAudG9TdHJpbmcgPSBmdW5jdGlvbiAoYikge1xuICAgICAgICAgICAgdmFyIHN0cixcbiAgICAgICAgICAgICAgICBuID0gdGhpcyxcbiAgICAgICAgICAgICAgICBzID0gbi5zLFxuICAgICAgICAgICAgICAgIGUgPSBuLmU7XG5cbiAgICAgICAgICAgIC8vIEluZmluaXR5IG9yIE5hTj9cbiAgICAgICAgICAgIGlmICggZSA9PT0gbnVsbCApIHtcblxuICAgICAgICAgICAgICAgIGlmIChzKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0ciA9ICdJbmZpbml0eSc7XG4gICAgICAgICAgICAgICAgICAgIGlmICggcyA8IDAgKSBzdHIgPSAnLScgKyBzdHI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc3RyID0gJ05hTic7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdHIgPSBjb2VmZlRvU3RyaW5nKCBuLmMgKTtcblxuICAgICAgICAgICAgICAgIGlmICggYiA9PSBudWxsIHx8ICFpc1ZhbGlkSW50KCBiLCAyLCA2NCwgMjUsICdiYXNlJyApICkge1xuICAgICAgICAgICAgICAgICAgICBzdHIgPSBlIDw9IFRPX0VYUF9ORUcgfHwgZSA+PSBUT19FWFBfUE9TXG4gICAgICAgICAgICAgICAgICAgICAgPyB0b0V4cG9uZW50aWFsKCBzdHIsIGUgKVxuICAgICAgICAgICAgICAgICAgICAgIDogdG9GaXhlZFBvaW50KCBzdHIsIGUgKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzdHIgPSBjb252ZXJ0QmFzZSggdG9GaXhlZFBvaW50KCBzdHIsIGUgKSwgYiB8IDAsIDEwLCBzICk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCBzIDwgMCAmJiBuLmNbMF0gKSBzdHIgPSAnLScgKyBzdHI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciB0cnVuY2F0ZWQgdG8gYSB3aG9sZVxuICAgICAgICAgKiBudW1iZXIuXG4gICAgICAgICAqL1xuICAgICAgICBQLnRydW5jYXRlZCA9IFAudHJ1bmMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gcm91bmQoIG5ldyBCaWdOdW1iZXIodGhpcyksIHRoaXMuZSArIDEsIDEgKTtcbiAgICAgICAgfTtcblxuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGFzIHRvU3RyaW5nLCBidXQgZG8gbm90IGFjY2VwdCBhIGJhc2UgYXJndW1lbnQuXG4gICAgICAgICAqL1xuICAgICAgICBQLnZhbHVlT2YgPSBQLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nKCk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvLyBBbGlhc2VzIGZvciBCaWdEZWNpbWFsIG1ldGhvZHMuXG4gICAgICAgIC8vUC5hZGQgPSBQLnBsdXM7ICAgICAgICAgLy8gUC5hZGQgaW5jbHVkZWQgYWJvdmVcbiAgICAgICAgLy9QLnN1YnRyYWN0ID0gUC5taW51czsgICAvLyBQLnN1YiBpbmNsdWRlZCBhYm92ZVxuICAgICAgICAvL1AubXVsdGlwbHkgPSBQLnRpbWVzOyAgIC8vIFAubXVsIGluY2x1ZGVkIGFib3ZlXG4gICAgICAgIC8vUC5kaXZpZGUgPSBQLmRpdjtcbiAgICAgICAgLy9QLnJlbWFpbmRlciA9IFAubW9kO1xuICAgICAgICAvL1AuY29tcGFyZVRvID0gUC5jbXA7XG4gICAgICAgIC8vUC5uZWdhdGUgPSBQLm5lZztcblxuXG4gICAgICAgIGlmICggY29uZmlnT2JqICE9IG51bGwgKSBCaWdOdW1iZXIuY29uZmlnKGNvbmZpZ09iaik7XG5cbiAgICAgICAgcmV0dXJuIEJpZ051bWJlcjtcbiAgICB9XG5cblxuICAgIC8vIFBSSVZBVEUgSEVMUEVSIEZVTkNUSU9OU1xuXG5cbiAgICBmdW5jdGlvbiBiaXRGbG9vcihuKSB7XG4gICAgICAgIHZhciBpID0gbiB8IDA7XG4gICAgICAgIHJldHVybiBuID4gMCB8fCBuID09PSBpID8gaSA6IGkgLSAxO1xuICAgIH1cblxuXG4gICAgLy8gUmV0dXJuIGEgY29lZmZpY2llbnQgYXJyYXkgYXMgYSBzdHJpbmcgb2YgYmFzZSAxMCBkaWdpdHMuXG4gICAgZnVuY3Rpb24gY29lZmZUb1N0cmluZyhhKSB7XG4gICAgICAgIHZhciBzLCB6LFxuICAgICAgICAgICAgaSA9IDEsXG4gICAgICAgICAgICBqID0gYS5sZW5ndGgsXG4gICAgICAgICAgICByID0gYVswXSArICcnO1xuXG4gICAgICAgIGZvciAoIDsgaSA8IGo7ICkge1xuICAgICAgICAgICAgcyA9IGFbaSsrXSArICcnO1xuICAgICAgICAgICAgeiA9IExPR19CQVNFIC0gcy5sZW5ndGg7XG4gICAgICAgICAgICBmb3IgKCA7IHotLTsgcyA9ICcwJyArIHMgKTtcbiAgICAgICAgICAgIHIgKz0gcztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSB0cmFpbGluZyB6ZXJvcy5cbiAgICAgICAgZm9yICggaiA9IHIubGVuZ3RoOyByLmNoYXJDb2RlQXQoLS1qKSA9PT0gNDg7ICk7XG4gICAgICAgIHJldHVybiByLnNsaWNlKCAwLCBqICsgMSB8fCAxICk7XG4gICAgfVxuXG5cbiAgICAvLyBDb21wYXJlIHRoZSB2YWx1ZSBvZiBCaWdOdW1iZXJzIHggYW5kIHkuXG4gICAgZnVuY3Rpb24gY29tcGFyZSggeCwgeSApIHtcbiAgICAgICAgdmFyIGEsIGIsXG4gICAgICAgICAgICB4YyA9IHguYyxcbiAgICAgICAgICAgIHljID0geS5jLFxuICAgICAgICAgICAgaSA9IHgucyxcbiAgICAgICAgICAgIGogPSB5LnMsXG4gICAgICAgICAgICBrID0geC5lLFxuICAgICAgICAgICAgbCA9IHkuZTtcblxuICAgICAgICAvLyBFaXRoZXIgTmFOP1xuICAgICAgICBpZiAoICFpIHx8ICFqICkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgYSA9IHhjICYmICF4Y1swXTtcbiAgICAgICAgYiA9IHljICYmICF5Y1swXTtcblxuICAgICAgICAvLyBFaXRoZXIgemVybz9cbiAgICAgICAgaWYgKCBhIHx8IGIgKSByZXR1cm4gYSA/IGIgPyAwIDogLWogOiBpO1xuXG4gICAgICAgIC8vIFNpZ25zIGRpZmZlcj9cbiAgICAgICAgaWYgKCBpICE9IGogKSByZXR1cm4gaTtcblxuICAgICAgICBhID0gaSA8IDA7XG4gICAgICAgIGIgPSBrID09IGw7XG5cbiAgICAgICAgLy8gRWl0aGVyIEluZmluaXR5P1xuICAgICAgICBpZiAoICF4YyB8fCAheWMgKSByZXR1cm4gYiA/IDAgOiAheGMgXiBhID8gMSA6IC0xO1xuXG4gICAgICAgIC8vIENvbXBhcmUgZXhwb25lbnRzLlxuICAgICAgICBpZiAoICFiICkgcmV0dXJuIGsgPiBsIF4gYSA/IDEgOiAtMTtcblxuICAgICAgICBqID0gKCBrID0geGMubGVuZ3RoICkgPCAoIGwgPSB5Yy5sZW5ndGggKSA/IGsgOiBsO1xuXG4gICAgICAgIC8vIENvbXBhcmUgZGlnaXQgYnkgZGlnaXQuXG4gICAgICAgIGZvciAoIGkgPSAwOyBpIDwgajsgaSsrICkgaWYgKCB4Y1tpXSAhPSB5Y1tpXSApIHJldHVybiB4Y1tpXSA+IHljW2ldIF4gYSA/IDEgOiAtMTtcblxuICAgICAgICAvLyBDb21wYXJlIGxlbmd0aHMuXG4gICAgICAgIHJldHVybiBrID09IGwgPyAwIDogayA+IGwgXiBhID8gMSA6IC0xO1xuICAgIH1cblxuXG4gICAgLypcbiAgICAgKiBSZXR1cm4gdHJ1ZSBpZiBuIGlzIGEgdmFsaWQgbnVtYmVyIGluIHJhbmdlLCBvdGhlcndpc2UgZmFsc2UuXG4gICAgICogVXNlIGZvciBhcmd1bWVudCB2YWxpZGF0aW9uIHdoZW4gRVJST1JTIGlzIGZhbHNlLlxuICAgICAqIE5vdGU6IHBhcnNlSW50KCcxZSsxJykgPT0gMSBidXQgcGFyc2VGbG9hdCgnMWUrMScpID09IDEwLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGludFZhbGlkYXRvck5vRXJyb3JzKCBuLCBtaW4sIG1heCApIHtcbiAgICAgICAgcmV0dXJuICggbiA9IHRydW5jYXRlKG4pICkgPj0gbWluICYmIG4gPD0gbWF4O1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gaXNBcnJheShvYmopIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfVxuXG5cbiAgICAvKlxuICAgICAqIENvbnZlcnQgc3RyaW5nIG9mIGJhc2VJbiB0byBhbiBhcnJheSBvZiBudW1iZXJzIG9mIGJhc2VPdXQuXG4gICAgICogRWcuIGNvbnZlcnRCYXNlKCcyNTUnLCAxMCwgMTYpIHJldHVybnMgWzE1LCAxNV0uXG4gICAgICogRWcuIGNvbnZlcnRCYXNlKCdmZicsIDE2LCAxMCkgcmV0dXJucyBbMiwgNSwgNV0uXG4gICAgICovXG4gICAgZnVuY3Rpb24gdG9CYXNlT3V0KCBzdHIsIGJhc2VJbiwgYmFzZU91dCApIHtcbiAgICAgICAgdmFyIGosXG4gICAgICAgICAgICBhcnIgPSBbMF0sXG4gICAgICAgICAgICBhcnJMLFxuICAgICAgICAgICAgaSA9IDAsXG4gICAgICAgICAgICBsZW4gPSBzdHIubGVuZ3RoO1xuXG4gICAgICAgIGZvciAoIDsgaSA8IGxlbjsgKSB7XG4gICAgICAgICAgICBmb3IgKCBhcnJMID0gYXJyLmxlbmd0aDsgYXJyTC0tOyBhcnJbYXJyTF0gKj0gYmFzZUluICk7XG4gICAgICAgICAgICBhcnJbIGogPSAwIF0gKz0gQUxQSEFCRVQuaW5kZXhPZiggc3RyLmNoYXJBdCggaSsrICkgKTtcblxuICAgICAgICAgICAgZm9yICggOyBqIDwgYXJyLmxlbmd0aDsgaisrICkge1xuXG4gICAgICAgICAgICAgICAgaWYgKCBhcnJbal0gPiBiYXNlT3V0IC0gMSApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCBhcnJbaiArIDFdID09IG51bGwgKSBhcnJbaiArIDFdID0gMDtcbiAgICAgICAgICAgICAgICAgICAgYXJyW2ogKyAxXSArPSBhcnJbal0gLyBiYXNlT3V0IHwgMDtcbiAgICAgICAgICAgICAgICAgICAgYXJyW2pdICU9IGJhc2VPdXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFyci5yZXZlcnNlKCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiB0b0V4cG9uZW50aWFsKCBzdHIsIGUgKSB7XG4gICAgICAgIHJldHVybiAoIHN0ci5sZW5ndGggPiAxID8gc3RyLmNoYXJBdCgwKSArICcuJyArIHN0ci5zbGljZSgxKSA6IHN0ciApICtcbiAgICAgICAgICAoIGUgPCAwID8gJ2UnIDogJ2UrJyApICsgZTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHRvRml4ZWRQb2ludCggc3RyLCBlICkge1xuICAgICAgICB2YXIgbGVuLCB6O1xuXG4gICAgICAgIC8vIE5lZ2F0aXZlIGV4cG9uZW50P1xuICAgICAgICBpZiAoIGUgPCAwICkge1xuXG4gICAgICAgICAgICAvLyBQcmVwZW5kIHplcm9zLlxuICAgICAgICAgICAgZm9yICggeiA9ICcwLic7ICsrZTsgeiArPSAnMCcgKTtcbiAgICAgICAgICAgIHN0ciA9IHogKyBzdHI7XG5cbiAgICAgICAgLy8gUG9zaXRpdmUgZXhwb25lbnRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbiA9IHN0ci5sZW5ndGg7XG5cbiAgICAgICAgICAgIC8vIEFwcGVuZCB6ZXJvcy5cbiAgICAgICAgICAgIGlmICggKytlID4gbGVuICkge1xuICAgICAgICAgICAgICAgIGZvciAoIHogPSAnMCcsIGUgLT0gbGVuOyAtLWU7IHogKz0gJzAnICk7XG4gICAgICAgICAgICAgICAgc3RyICs9IHo7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBlIDwgbGVuICkge1xuICAgICAgICAgICAgICAgIHN0ciA9IHN0ci5zbGljZSggMCwgZSApICsgJy4nICsgc3RyLnNsaWNlKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHRydW5jYXRlKG4pIHtcbiAgICAgICAgbiA9IHBhcnNlRmxvYXQobik7XG4gICAgICAgIHJldHVybiBuIDwgMCA/IG1hdGhjZWlsKG4pIDogbWF0aGZsb29yKG4pO1xuICAgIH1cblxuXG4gICAgLy8gRVhQT1JUXG5cblxuICAgIEJpZ051bWJlciA9IGFub3RoZXIoKTtcblxuICAgIC8vIEFNRC5cbiAgICBpZiAoIHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kICkge1xuICAgICAgICBkZWZpbmUoIGZ1bmN0aW9uICgpIHsgcmV0dXJuIEJpZ051bWJlcjsgfSApO1xuXG4gICAgLy8gTm9kZSBhbmQgb3RoZXIgZW52aXJvbm1lbnRzIHRoYXQgc3VwcG9ydCBtb2R1bGUuZXhwb3J0cy5cbiAgICB9IGVsc2UgaWYgKCB0eXBlb2YgbW9kdWxlICE9ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzICkge1xuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IEJpZ051bWJlcjtcbiAgICAgICAgaWYgKCAhY3J5cHRvICkgdHJ5IHsgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJyk7IH0gY2F0Y2ggKGUpIHt9XG5cbiAgICAvLyBCcm93c2VyLlxuICAgIH0gZWxzZSB7XG4gICAgICAgIGdsb2JhbC5CaWdOdW1iZXIgPSBCaWdOdW1iZXI7XG4gICAgfVxufSkodGhpcyk7XG4iLCJ2YXIgd2ViMyA9IHJlcXVpcmUoJy4vbGliL3dlYjMnKTtcbndlYjMucHJvdmlkZXJzLkh0dHBQcm92aWRlciA9IHJlcXVpcmUoJy4vbGliL3dlYjMvaHR0cHByb3ZpZGVyJyk7XG53ZWIzLnByb3ZpZGVycy5RdFN5bmNQcm92aWRlciA9IHJlcXVpcmUoJy4vbGliL3dlYjMvcXRzeW5jJyk7XG53ZWIzLmV0aC5jb250cmFjdCA9IHJlcXVpcmUoJy4vbGliL3dlYjMvY29udHJhY3QnKTtcblxuLy8gZG9udCBvdmVycmlkZSBnbG9iYWwgdmFyaWFibGVcbmlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2Ygd2luZG93LndlYjMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgd2luZG93LndlYjMgPSB3ZWIzO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHdlYjM7XG5cbiJdfQ==
