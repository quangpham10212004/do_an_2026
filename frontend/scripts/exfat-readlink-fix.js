// Ổ exFAT trả EISDIR khi readlink một file thường; Node/webpack chỉ coi EINVAL là "không phải symlink".
// Nạp bằng NODE_OPTIONS=--require để áp dụng cả cho tiến trình con của next build.
const fs = require("fs");
const fix = (err) => { if (err && err.code === "EISDIR") err.code = "EINVAL"; return err; };
const origCb = fs.readlink;
fs.readlink = function (p, opts, cb) {
  const done = typeof opts === "function" ? opts : cb;
  const args = typeof opts === "function" ? [p] : [p, opts];
  return origCb.call(fs, ...args, (err, ...rest) => done(fix(err), ...rest));
};
const origSync = fs.readlinkSync;
fs.readlinkSync = function (...a) { try { return origSync.apply(fs, a); } catch (e) { throw fix(e); } };
const origP = fs.promises.readlink;
fs.promises.readlink = function (...a) { return origP.apply(fs.promises, a).catch((e) => { throw fix(e); }); };
