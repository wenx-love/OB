var counter = 0;
function dec(i) {
  counter++;
  return i + '_' + counter;
}
function run() {
  dec(0);
  dec(0);
}