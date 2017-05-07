// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Unicode property escapes for `Script_Extensions=Buhid`
info: |
  Generated by https://github.com/mathiasbynens/unicode-property-escapes-tests
  Unicode v9.0.0
  Emoji v5.0 (UTR51)
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
includes: [regExpUtils.js]
---*/

const matchSymbols = buildString({
  loneCodePoints: [],
  ranges: [
    [0x001735, 0x001736],
    [0x001740, 0x001753]
  ]
});
testPropertyEscapes(
  /^\p{Script_Extensions=Buhid}+$/u,
  matchSymbols,
  "\\p{Script_Extensions=Buhid}"
);
testPropertyEscapes(
  /^\p{Script_Extensions=Buhd}+$/u,
  matchSymbols,
  "\\p{Script_Extensions=Buhd}"
);
testPropertyEscapes(
  /^\p{scx=Buhid}+$/u,
  matchSymbols,
  "\\p{scx=Buhid}"
);
testPropertyEscapes(
  /^\p{scx=Buhd}+$/u,
  matchSymbols,
  "\\p{scx=Buhd}"
);

const nonMatchSymbols = buildString({
  loneCodePoints: [],
  ranges: [
    [0x00DC00, 0x00DFFF],
    [0x000000, 0x001734],
    [0x001737, 0x00173F],
    [0x001754, 0x00DBFF],
    [0x00E000, 0x10FFFF]
  ]
});
testPropertyEscapes(
  /^\P{Script_Extensions=Buhid}+$/u,
  nonMatchSymbols,
  "\\P{Script_Extensions=Buhid}"
);
testPropertyEscapes(
  /^\P{Script_Extensions=Buhd}+$/u,
  nonMatchSymbols,
  "\\P{Script_Extensions=Buhd}"
);
testPropertyEscapes(
  /^\P{scx=Buhid}+$/u,
  nonMatchSymbols,
  "\\P{scx=Buhid}"
);
testPropertyEscapes(
  /^\P{scx=Buhd}+$/u,
  nonMatchSymbols,
  "\\P{scx=Buhd}"
);
