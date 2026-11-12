var _arr = ['alpha', 'beta'];
var lookups = 0;
function dec(i) {
  lookups++;
  return _arr[i];
}
function report() {
  return lookups;
}
function run() {
  dec(0);
  dec(0);
  dec(1);
  dec(1);
}