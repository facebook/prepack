// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Unicode property escapes for `Script=Brahmi`
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
    0x01107F
  ],
  ranges: [
    [0x011000, 0x01104D],
    [0x011052, 0x01106F]
  ]
});
testPropertyEscapes(
  /^\p{Script=Brahmi}+$/u,
  matchSymbols,
  "\\p{Script=Brahmi}"
);
testPropertyEscapes(
  /^\p{Script=Brah}+$/u,
  matchSymbols,
  "\\p{Script=Brah}"
);
testPropertyEscapes(
  /^\p{sc=Brahmi}+$/u,
  matchSymbols,
  "\\p{sc=Brahmi}"
);
testPropertyEscapes(
  /^\p{sc=Brah}+$/u,
  matchSymbols,
  "\\p{sc=Brah}"
);

const nonMatchSymbols = buildString({
  loneCodePoints: [],
  ranges: [
    [0x00DC00, 0x00DFFF],
    [0x000000, 0x00DBFF],
    [0x00E000, 0x010FFF],
    [0x01104E, 0x011051],
    [0x011070, 0x01107E],
    [0x011080, 0x10FFFF]
  ]
});
testPropertyEscapes(
  /^\P{Script=Brahmi}+$/u,
  nonMatchSymbols,
  "\\P{Script=Brahmi}"
);
testPropertyEscapes(
  /^\P{Script=Brah}+$/u,
  nonMatchSymbols,
  "\\P{Script=Brah}"
);
testPropertyEscapes(
  /^\P{sc=Brahmi}+$/u,
  nonMatchSymbols,
  "\\P{sc=Brahmi}"
);
testPropertyEscapes(
  /^\P{sc=Brah}+$/u,
  nonMatchSymbols,
  "\\P{sc=Brah}"
);
