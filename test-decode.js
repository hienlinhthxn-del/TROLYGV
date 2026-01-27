const code = "eyJzIjoiVG_DoW4iLCJnIjoiMSIsInEiOltbMSwiU-G7kSBsaeG7gW4gc2F1IGPhu6dhIHPhu5EgNyBsw6Agc-G7kSBuw6BvPyIsWyJBLiA2IiwiQi4gOCIsIkMuIDkiLCJELiAxMCJdLCJCLiA4IiwiU-G7kSBsaeG7gW4gc2F1IGPhu6dhIG3hu5l0IHPhu5EgbMOgIHPhu5EgbOG7m24gaMahbiBz4buRIMSRw7MgMSDEkcahbiB24buLLiA3ICsgMSA9IDguIl0sWzEsIlBow6lwIHTDrW5oIG7DoG8gc2F1IMSRw6J5IGNobyBr4bq_dCBxdeG6oyBsw6AgMTA_IixbIkEuIDUgKyAzIiwiQi4gNiArIDQiLCJDLiA5IC0gMSIsIkQuIDcgKyAyIl0sIkIuIDYgKyA0IiwiS2nhu4NtIHRyYSBjw6FjIHBow6lwIHTDrW5oOiA1KzM9ODsgNis0PTEwOyA5LTE9ODsgNysyPTkuIENo4buJIGPDsyA2ICsgNCA9IDEwLiJdLFsxLCJUcm9uZyBjw6FjIHPhu5Egc2F1LCBz4buRIG7DoG8gbMOgIHPhu5EgbOG7m24gbmjhuqV0PyIsWyJBLiA0IiwiQi4gMSIsIkMuIDEwIiwiRC4gMCJdLCJDLiAxMCIsIlNvIHPDoW5oIGPDoWMgc+G7kSB04burIDAgxJHhur9uIDEwLCBz4buRIDEwIGzDoCBz4buRIGzhu5tuIG5o4bqldC4iXSxbMSwiS-G6v3QgcXXhuqMgY-G7p2EgcGjDqXAgdMOtbmggOCAtIDUgbMOgIGJhbyBuaGnDqnU_IixbIkEuIDQiLCJCLiAzIiwiQy4gMiIsIkQuIDEzIl0sIkIuIDMiLCLEkMOieSBsw6AgcGjDqXAgdHLhu6sgY8ahIGLhuqNuOiA4IHRy4burIMSRaSA1IGPDsm4gbOG6oWkgMy4iXSxbMCwixJBp4buBbiBk4bqldSA-OyA8OyA9IHRow61jaCBo4bujcCB2w6BvIGNo4buXIHRy4buRbmc6IDkgKyAxIF9fXyA1ICsgNSIsW10sIj0gKGhv4bq3YyBi4bqxbmcpIiwiVGEgdMOtbmg6IDkgKyAxID0gMTA7IDUgKyA1ID0gMTAuIFbhuq95IDEwID0gMTAuIl0sWzAsIkjDuW5nIGPDsyA2IHZpw6puIGJpLCBt4bq5IGNobyB0aMOqbSAzIHZpw6puIGJpLiBI4buPaSBIw7luZyBjw7MgdOG6pXQgY-G6oyBiYW8gbmhpw6p1IHZpw6puIGJpPyAoVHLDrG5oIGLDoHkgcGjDqXAgdMOtbmgpIixbXSwiUGjDqXAgdMOtbmg6IDYgKyAzID0gOSAodmnDqm4gYmkpLlxuVHLhuqMgbOG7nWk6IEjDuW5nIGPDsyB04bqldCBj4bqjIDkgdmnDqm4gYmkuIiwixJDDonkgbMOgIGLDoGkgdG_DoW4gY-G7mW5nIMSRxqFuIGdp4bqjbiB0cm9uZyBwaOG6oW0gdmkgMTAuIl0sWzAsIlZp4bq_dCBjw6FjIHPhu5Egc2F1IHRoZW8gdGjhu6kgdOG7sSB04burIGLDqSDEkeG6v24gbOG7m246IDIsIDksIDUsIDAsIDciLFtdLCIwLCAyLCA1LCA3LCA5IiwiU-G6r3AgeOG6v3AgY8OhYyBz4buRIHThu7Egbmhpw6puIHRoZW8gdGjhu6kgdOG7sSB0xINuZyBk4bqnbi4iXSxbMCwiVHJvbmcgcGjDqXAgdMOtbmggdHLhu6s6IDEwIC0gX19fID0gNC4gU-G7kSBjw7JuIHRoaeG6v3UgdHJvbmcgw7QgdHLhu5FuZyBsw6Agc-G7kSBuw6BvPyIsW10sIjYiLCLEkMOieSBsw6AgYsOgaSB0b8OhbiB0w6xtIHPhu5EgaOG6oW5nIGLhu4sgdHLhu6sgKGhv4bq3YyBz4butIGThu6VuZyBwaMOpcCBj4buZbmcgxJHhu4Mga2nhu4NtIHRyYTogNCArIDYgPSAxMCkuIl0sWzAsIk1haSBjw7MgOSBjw6FpIGvhurlvLiBNYWkgY2hvIGVtIDIgY8OhaSBr4bq5bywgc2F1IMSRw7MgxINuIG3huqV0IDEgY8OhaSBr4bq5by4gSOG7j2kgTWFpIGPDsm4gbOG6oWkgYmFvIG5oacOqdSBjw6FpIGvhurlvPyAoVHLDrG5oIGLDoHkgcGjDqXAgdMOtbmgpIixbXSwiUGjDqXAgdMOtbmg6IDkgLSAyID0gNyAoY8OhaSBr4bq5bykuIFNhdSDEkcOzOiA3IC0gMSA9IDYgKGPDoWkga-G6uW8pLlxuSG_hurdjOiA5IC0gKDIgKyAxKSA9IDYgKGPDoWkga-G6uW8pLlxuVHLhuqMgbOG7nWk6IE1haSBjw7JuIGzhuqFpIDYgY8OhaSBr4bq5by4iLCLEkMOieSBsw6AgYsOgaSB0b8OhbiBjw7MgaGFpIGLGsOG7m2MgdHLhu6sgbGnDqm4gdGnhur9wIHRyb25nIHBo4bqhbSB2aSAxMC4iXSxbMCwiU-G7rSBk4bulbmcgY8OhYyBz4buRIDMsIDUsIHbDoCBk4bqldSBwaMOpcCB0w61uaCAoKyBob-G6t2MgLSkgxJHhu4MgdOG6oW8gdGjDoG5oIG3hu5l0IHBow6lwIHTDrW5oIGPDsyBr4bq_dCBxdeG6oyBi4bqxbmcgOC4gKENo4buJIMSRxrDhu6NjIGTDuW5nIDIgc-G7kSB2w6AgMSBwaMOpcCB0w61uaCkiLFtdLCIzICsgNSA9IDggKGhv4bq3YyA1ICsgMyA9IDgpIiwiWcOqdSBj4bqndSB24bqtbiBk4bulbmcgY2FvIGzDoCB0w6xtIHBow6lwIHTDrW5oIHRow61jaCBo4bujcCB04burIGPDoWMgc-G7kSDEkcOjIGNobyDEkeG7gyDEkeG6oXQgxJHGsOG7o2Mga-G6v3QgcXXhuqMgbW9uZyBtdeG7kW4gKDgpLiAzICsgNSA9IDggbMOgIMSRw6FwIMOhbiDEkcO6bmcgZHV5IG5o4bqldCB24bubaSBjw6FjIHPhu5EgxJHDoyBjaG8gdsOgIHBow6lwIGPhu5luZy90cuG7qy4iXV19";

console.log("=== TEST DECODE MÃ ĐỀ ===\n");

// Làm sạch Base64
let cleanBase64 = code.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
while (cleanBase64.length % 4 !== 0) {
    cleanBase64 += '=';
}

console.log("Độ dài mã:", code.length);
console.log("Độ dài sau làm sạch:", cleanBase64.length);

// Test phương pháp mới (TextDecoder)
console.log("\n--- Phương pháp 1: TextDecoder (MỚI) ---");
try {
    const binaryString = Buffer.from(cleanBase64, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(bytes);
    const data = JSON.parse(jsonString);

    console.log("✅ THÀNH CÔNG!");
    console.log("Môn:", data.s);
    console.log("Lớp:", data.g);
    console.log("Số câu:", data.q.length);
    console.log("\nCâu 1:", data.q[0][1]);
} catch (e) {
    console.log("❌ THẤT BẠI:", e.message);
}

// Test phương pháp cũ (Legacy)
console.log("\n--- Phương pháp 2: Legacy (CŨ) ---");
try {
    const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8');
    const data = JSON.parse(decoded);

    console.log("✅ THÀNH CÔNG!");
    console.log("Môn:", data.s);
    console.log("Lớp:", data.g);
    console.log("Số câu:", data.q.length);
    console.log("\nCâu 1:", data.q[0][1]);
} catch (e) {
    console.log("❌ THẤT BẠI:", e.message);
}
