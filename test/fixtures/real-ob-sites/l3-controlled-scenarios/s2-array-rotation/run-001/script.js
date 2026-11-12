var strings = ['hello', 'world', 'test'];
function dec(i) {
  return strings[i];
}
function rotate() {
  strings.push(strings.shift());
}
function run() {
  dec(1);
  dec(1);
  dec(0);
  rotate();
  dec(0);
}