
import React from 'react';

interface SecurityCenterProps {
   onClearAllData: () => void;
}

const SecurityCenter: React.FC<SecurityCenterProps> = ({ onClearAllData }) => {
   return (
      <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 overflow-hidden">
         <div className="flex items-center justify-between">
            <div>
               <h2 className="text-2xl font-black text-slate-800 tracking-tight">Trung tâm Bảo mật & Quyền riêng tư</h2>
               <p className="text-sm text-slate-500 font-medium">Bảo vệ tài sản trí tuệ và dữ liệu của Thầy Cô.</p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
               <i className="fas fa-user-shield text-xl"></i>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-4">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                     <i className="fas fa-lock"></i>
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Mã hóa Tài liệu</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">Mọi văn bản trong phần "Soạn thảo" và "Lưu trữ Cloud" đều được mã hóa cục bộ trên trình duyệt. Chỉ Thầy Cô mới có quyền truy cập nội dung này.</p>
                  <div className="flex items-center space-x-2 text-emerald-600 text-[10px] font-bold uppercase">
                     <i className="fas fa-circle-check"></i>
                     <span>Đang hoạt động</span>
                  </div>
               </div>

               <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-4">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                     <i className="fas fa-cloud-shield"></i>
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">API Gemini Secure</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">Dữ liệu gửi đến mô hình AI được bảo vệ qua kênh truyền HTTPS/SSL 256-bit. Thông tin không được sử dụng để huấn luyện mô hình công cộng.</p>
                  <div className="flex items-center space-x-2 text-emerald-600 text-[10px] font-bold uppercase">
                     <i className="fas fa-circle-check"></i>
                     <span>Đã xác thực SSL</span>
                  </div>
               </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[40px] text-white space-y-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
               <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2">
                     <h4 className="text-lg font-black uppercase tracking-widest text-indigo-400">Quyền xóa dữ liệu (Right to be Forgotten)</h4>
                     <p className="text-xs text-slate-300 max-w-xl leading-relaxed">Theo tiêu chuẩn bảo mật sư phạm, Thầy Cô có quyền xóa sạch mọi dấu vết hoạt động của mình trên hệ thống này bất cứ lúc nào.</p>
                  </div>
                  <button
                     onClick={onClearAllData}
                     className="px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-900/40 transition-all active:scale-95"
                  >
                     Xóa sạch dữ liệu ngay
                  </button>
               </div>
            </div>

            <div className="p-8 bg-white rounded-[40px] border border-slate-200 space-y-6">
               <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Các tính năng an toàn đang bật</h4>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                     { label: 'Sandbox Tệp tin', desc: 'Các tệp tải lên được quét trong môi trường cô lập.', icon: 'fa-box-open' },
                     { label: 'Ẩn danh hóa', desc: 'Tự động che mờ các thông tin nhạy cảm định dạng số.', icon: 'fa-user-secret' },
                     { label: 'Xác thực đa yếu tố', desc: 'Bảo vệ quyền truy cập hồ sơ giáo viên.', icon: 'fa-fingerprint' },
                     { label: 'Chống mã độc', desc: 'Ngăn chặn các đoạn mã thực thi trong tệp đính kèm.', icon: 'fa-bug-slash' },
                     { label: 'Kiểm tra liên kết', desc: 'Xác minh độ tin cậy của URL trước khi AI truy cập.', icon: 'fa-link-slash' },
                     { label: 'Lịch sử an toàn', desc: 'Ghi nhật ký các lần truy cập dữ liệu quan trọng.', icon: 'fa-clock-rotate-left' }
                  ].map((item, i) => (
                     <div key={i} className="flex items-start space-x-3 p-4 bg-slate-50 rounded-2xl hover:bg-white border border-transparent hover:border-indigo-100 transition-all">
                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                           <i className={`fas ${item.icon} text-xs`}></i>
                        </div>
                        <div>
                           <p className="text-[11px] font-black uppercase text-slate-700">{item.label}</p>
                           <p className="text-[9px] text-slate-400 font-medium leading-relaxed mt-1">{item.desc}</p>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
};

export default SecurityCenter;
