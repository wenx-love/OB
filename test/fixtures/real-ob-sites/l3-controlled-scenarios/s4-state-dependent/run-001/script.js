var _arr = ['a', 'b', 'c'];
var offset = 0;
function dec(i) {
  return _arr[i + offset];
}
function setOffset(n) {
  offset = n;
}
function run() {
  dec(0);
  dec(0);
  setOffset(1);
  dec(0);
}