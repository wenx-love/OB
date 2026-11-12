var _arr = ['alpha', 'beta', 'gamma'];
function dec(i) {
  return _arr[i];
}
function run() {
  dec(1);
  dec(1);
}
function later() {
  return dec(1);
}
function shadowed() {
  function dec(i) {
    return 'X' + i;
  }
  return dec(1);
}