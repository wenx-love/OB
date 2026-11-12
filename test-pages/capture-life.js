var _arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

function decA(i) {
  i = i - 0;
  return _arr[i % 10];
}

function userFn() {
  var u = 1;
  return u;
}

var n = 0;
window.__count = 0;

function startLoop() {
  var timer = setInterval(function () {
    decA(n);
    n++;
    window.__count = n;
    if (location.hash === '#dbg' && n === 10) {
      debugger;
    }
    if (n >= 100) {
      clearInterval(timer);
      setTimeout(function () {
        userFn();
        document.title = 'done';
      }, 300);
    }
  }, 15);
}

setTimeout(startLoop, 1500);
