
import React from 'react';
import { CloudDocument } from '../types';

interface CloudDriveProps {
  documents: CloudDocument[];
  onOpen: (doc: CloudDocument) => void;
  onDelete: (id: string) => void;
}

const CloudDrive: React.FC<CloudDriveProps> = ({ documents, onOpen, onDelete }) => {
  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800">Lưu trữ Trực tuyến An toàn</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Tài liệu của Thầy Cô được mã hóa 256-bit.</p>
        </div>
        <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center">
          <i className="fas fa-lock mr-2 text-[8px]"></i>
          Mã hóa đầu cuối
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.length > 0 ? (
          documents.map(doc => (
            <div 
              key={doc.id} 
              className="group bg-white p-5 rounded-[32px] border border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all cursor-pointer relative"
              onClick={() => onOpen(doc)}
            >
              <div className="absolute top-4 right-4 flex items-center space-x-2">
                {doc.isEncrypted && (
                  <div className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-500" title="Đã mã hóa an toàn">
                    <i className="fas fa-lock text-[10px]"></i>
                  </div>
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <i className="fas fa-trash-alt text-[10px]"></i>
                </button>
              </div>
              
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
                <i className="fas fa-file-word text-xl"></i>
              </div>
              
              <h3 className="text-[14px] font-black text-slate-800 truncate pr-6">{doc.name}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
                Cập nhật: {new Date(doc.updatedAt).toLocaleDateString('vi-VN')}
              </p>
              
              <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                <span className="text-[10px] font-black text-indigo-400 uppercase">{doc.size}</span>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Mở an toàn</span>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-24 flex flex-col items-center justify-center text-slate-200 border-4 border-dashed border-slate-50 rounded-[48px]">
            <i className="fas fa-shield-halved text-6xl mb-4 opacity-10"></i>
            <p className="text-[11px] font-black uppercase tracking-[0.4em]">Kênh lưu trữ riêng tư chưa có dữ liệu</p>
            <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Thầy Cô có thể yên tâm đồng bộ mọi thông tin bài giảng</p>
          </div>
        )}
      </div>

      <div className="mt-auto p-6 bg-slate-900 rounded-[32px] text-white flex items-center justify-between overflow-hidden relative">
         <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
         <div className="flex items-center space-x-4 relative z-10">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
               <i className="fas fa-shield-halved text-indigo-300"></i>
            </div>
            <div>
               <p className="text-[13px] font-black uppercase tracking-widest">Bảo mật đa tầng AES-256</p>
               <p className="text-[10px] text-slate-400 font-medium">Toàn bộ dữ liệu tải lên được cách ly và bảo vệ tuyệt đối.</p>
            </div>
         </div>
         <div className="text-right relative z-10">
            <p className="text-[10px] font-black text-indigo-400 uppercase">Dung lượng bảo mật</p>
            <p className="text-sm font-black">2.4 GB / 10 GB</p>
         </div>
      </div>
    </div>
  );
};

export default CloudDrive;
