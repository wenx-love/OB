const s = "var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);";
console.log('Length:', s.length);
console.log('Char at 59-65:', s.slice(59, 65));
console.log('Chars around 59:');
for (let i = 55; i < 66; i++) {
  console.log(`  ${i}: '${s[i]}'`);
}
