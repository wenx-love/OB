// 复杂 OB fixture：字符串数组 + Base64 + 控制流平坦化 + 代理函数 + 布尔混淆 + 十六进制
// 原始语义：processUser 构建签名对象，发送请求

var _0xarr = ["dXNlcg==", "dG9rZW4=", "c2lnbg==", "ZW5jcnlwdA==", "bGVuZ3Ro", "Z2V0", "cG9zdA==", "c3RyaW5naWZ5"];
// After rotate(0x3+1=4): 0=encrypt 1=length 2=get 3=post 4=stringify 5=user 6=token 7=sign

(function(_0x1111, _0x2222) {
    var _0xshift = function(_0x3333) {
        while (--_0x3333) {
            _0x1111['push'](_0x1111['shift']());
        }
    };
    _0xshift(++_0x2222);
})(_0xarr, 0x3);

function _0xdec(_0xidx) {
    _0xidx = _0xidx - 0x0;
    var _0xval = _0xarr[_0xidx];
    return atob(_0xval);
}

var _0xadd = function(_0xa, _0xb) { return _0xa + _0xb; };
var _0xeq = function(_0xa, _0xb) { return _0xa === _0xb; };

function processUser(_0xuser) {
    var _0xresult = {};
    var _0xorder = '2|0|3|1|4'['split']('|');
    var _0xi = 0x0;
    while (!![]) {
        switch (_0xorder[_0xi++]) {
            case '0':
                _0xresult[_0xdec(0x7)] = _0xadd(_0xuser[_0xdec(0x5)], ':' + _0xuser[_0xdec(0x6)]);
                continue;
            case '1':
                if (_0xeq(_0xresult[_0xdec(0x1)], 0x0)) {
                    return !![];
                }
                continue;
            case '2':
                _0xresult[_0xdec(0x5)] = _0xuser[_0xdec(0x5)];
                continue;
            case '3':
                _0xresult[_0xdec(0x0)] = _0xadd(_0xresult[_0xdec(0x7)], _0xresult[_0xdec(0x5)]);
                continue;
            case '4':
                return _0xresult;
        }
        break;
    }
}

if (!![]) {
    var _0xapi = {};
    _0xapi[_0xdec(0x2)] = function(_0xurl) {
        return _0xurl;
    };
    _0xapi[_0xdec(0x3)] = function(_0xurl, _0xdata) {
        return { url: _0xurl, data: _0xdata };
    };
} else {
    console['log']('dead code');
    throw new Error('unreachable');
}

var result = processUser({ user: 'admin', token: 'abc123' });
if (result) {
    _0xapi[_0xdec(0x3)]('/api/sign', JSON[_0xdec(0x4)](result));
}
