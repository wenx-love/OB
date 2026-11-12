// 复杂 OB fixture：字符串数组 + Base64 + 控制流平坦化 + 代理函数 + 布尔混淆 + 十六进制
// 原始语义：processUser 构建签名对象，发送请求

// After rotate(0x3+1=4): 0=encrypt 1=length 2=get 3=post 4=stringify 5=user 6=token 7=sign

function processUser(_0xuser) {
  var _0xresult = {};
  _0xresult.user = _0xuser.user;
  _0xresult.sign = _0xuser.user + (':' + _0xuser.token);
  _0xresult.encrypt = _0xresult.sign + _0xresult.user;
  if (_0xresult.length === 0) {
    return true;
  }
  return _0xresult;
}
var _0xapi = {};
_0xapi.get = function (_0xurl) {
  return _0xurl;
};
_0xapi.post = function (_0xurl, _0xdata) {
  return {
    url: _0xurl,
    data: _0xdata
  };
};
var result = processUser({
  user: 'admin',
  token: 'abc123'
});
if (result) {
  _0xapi.post('/api/sign', JSON.stringify(result));
}