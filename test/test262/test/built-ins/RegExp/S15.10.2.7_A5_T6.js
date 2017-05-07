// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: >
    The production QuantifierPrefix :: ? evaluates by returning the two
    results 0 and 1
es5id: 15.10.2.7_A5_T6
description: Execute /o?pqrst/.exec("pqrstuvw") and check results
---*/

var __executed = /o?pqrst/.exec("pqrstuvw");

var __expected = ["pqrst"];
__expected.index = 0;
__expected.input = "pqrstuvw";

//CHECK#1
if (__executed.length !== __expected.length) {
	$ERROR('#1: __executed = /o?pqrst/.exec("pqrstuvw"); __executed.length === ' + __expected.length + '. Actual: ' + __executed.length);
}

//CHECK#2
if (__executed.index !== __expected.index) {
	$ERROR('#2: __executed = /o?pqrst/.exec("pqrstuvw"); __executed.index === ' + __expected.index + '. Actual: ' + __executed.index);
}

//CHECK#3
if (__executed.input !== __expected.input) {
	$ERROR('#3: __executed = /o?pqrst/.exec("pqrstuvw"); __executed.input === ' + __expected.input + '. Actual: ' + __executed.input);
}

//CHECK#4
for(var index=0; index<__expected.length; index++) {
	if (__executed[index] !== __expected[index]) {
		$ERROR('#4: __executed = /o?pqrst/.exec("pqrstuvw"); __executed[' + index + '] === ' + __expected[index] + '. Actual: ' + __executed[index]);
	}
}
