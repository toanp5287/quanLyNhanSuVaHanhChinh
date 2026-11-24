const fs=require('fs');
const p='D:/quanLyNhanSuVaHanhChinh/backend/src/controllers/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.controller.js';
let s=fs.readFileSync(p,'utf8');
function rep(re, txt){const n=s.replace(re,txt); if(n===s) console.error('miss'); s=n;}
rep(/export const postShiftAssignment = async \(req, res\) => \{[\s\S]*?return respondError\(res, error, "Không thể phân ca cho nhân viên"\);\s*\}\s*\};/,
`export const postShiftAssignment = async (req, res) => {
  try {
    const data = await createShiftAssignment(req.user, req.body || {});
    const sum = data?.recalc_summary;
    const message = sum
      ? \`Phân ca thành công. Đã tính lại \${sum.recalculated_days} ngày công (\${sum.recalculated_employees} nhân viên), bỏ qua \${sum.skipped_locked_days} ngày thuộc kỳ đã khóa.\`
      : "Phân ca thành công";
    return res.status(201).json({ success: true, message, data });
  } catch (error) {
    return respondError(res, error, "Không thể phân ca cho nhân viên");
  }
};`);
rep(/export const putShiftAssignment = async \(req, res\) => \{[\s\S]*?return respondError\(res, error, "Không thể cập nhật phân ca"\);\s*\}\s*\};/,
`export const putShiftAssignment = async (req, res) => {
  try {
    const data = await updateShiftAssignment(req.user, req.params.id, req.body || {});
    const sum = data?.recalc_summary;
    const message = sum
      ? \`Cập nhật phân ca thành công. Đã tính lại \${sum.recalculated_days} ngày công (\${sum.recalculated_employees} nhân viên), bỏ qua \${sum.skipped_locked_days} ngày thuộc kỳ đã khóa.\`
      : "Cập nhật phân ca thành công";
    return res.status(200).json({ success: true, message, data });
  } catch (error) {
    return respondError(res, error, "Không thể cập nhật phân ca");
  }
};`);
rep(/export const removeShiftAssignment = async \(req, res\) => \{[\s\S]*?return respondError\(res, error, "Không thể xóa phân ca"\);\s*\}\s*\};/,
`export const removeShiftAssignment = async (req, res) => {
  try {
    const data = await deleteShiftAssignment(req.user, req.params.id);
    const sum = data?.recalc_summary;
    const message = sum
      ? \`Đã xóa phân ca. Đã tính lại \${sum.recalculated_days} ngày công (\${sum.recalculated_employees} nhân viên), bỏ qua \${sum.skipped_locked_days} ngày thuộc kỳ đã khóa.\`
      : "Đã xóa phân ca";
    return res.status(200).json({ success: true, message, data });
  } catch (error) {
    return respondError(res, error, "Không thể xóa phân ca");
  }
};`);
fs.writeFileSync(p,s,'utf8');
console.log('ok');
