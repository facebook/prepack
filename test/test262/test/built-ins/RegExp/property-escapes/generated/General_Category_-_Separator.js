// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Unicode property escapes for `General_Category=Separator`
info: |
  Generated by https://github.com/mathiasbynens/unicode-property-escapes-tests
  Unicode v9.0.0
  Emoji v5.0 (UTR51)
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
includes: [regExpUtils.js]
---*/

const matchSymbols = buildString({
  loneCodePoints: [
    0x000020,
    0x0000A0,
    0x001680,
    0x00202F,
    0x00205F,
    0x003000
  ],
  ranges: [
    [0x002000, 0x00200A],
    [0x002028, 0x002029]
  ]
});
testPropertyEscapes(
  /^\p{General_Category=Separator}+$/u,
  matchSymbols,
  "\\p{General_Category=Separator}"
);
testPropertyEscapes(
  /^\p{General_Category=Z}+$/u,
  matchSymbols,
  "\\p{General_Category=Z}"
);
testPropertyEscapes(
  /^\p{gc=Separator}+$/u,
  matchSymbols,
  "\\p{gc=Separator}"
);
testPropertyEscapes(
  /^\p{gc=Z}+$/u,
  matchSymbols,
  "\\p{gc=Z}"
);
testPropertyEscapes(
  /^\p{Separator}+$/u,
  matchSymbols,
  "\\p{Separator}"
);
testPropertyEscapes(
  /^\p{Z}+$/u,
  matchSymbols,
  "\\p{Z}"
);

const nonMatchSymbols = buildString({
  loneCodePoints: [],
  ranges: [
    [0x00DC00, 0x00DFFF],
    [0x000000, 0x00001F],
    [0x000021, 0x00009F],
    [0x0000A1, 0x00167F],
    [0x001681, 0x001FFF],
    [0x00200B, 0x002027],
    [0x00202A, 0x00202E],
    [0x002030, 0x00205E],
    [0x002060, 0x002FFF],
    [0x003001, 0x00DBFF],
    [0x00E000, 0x10FFFF]
  ]
});
testPropertyEscapes(
  /^\P{General_Category=Separator}+$/u,
  nonMatchSymbols,
  "\\P{General_Category=Separator}"
);
testPropertyEscapes(
  /^\P{General_Category=Z}+$/u,
  nonMatchSymbols,
  "\\P{General_Category=Z}"
);
testPropertyEscapes(
  /^\P{gc=Separator}+$/u,
  nonMatchSymbols,
  "\\P{gc=Separator}"
);
testPropertyEscapes(
  /^\P{gc=Z}+$/u,
  nonMatchSymbols,
  "\\P{gc=Z}"
);
testPropertyEscapes(
  /^\P{Separator}+$/u,
  nonMatchSymbols,
  "\\P{Separator}"
);
testPropertyEscapes(
  /^\P{Z}+$/u,
  nonMatchSymbols,
  "\\P{Z}"
);
