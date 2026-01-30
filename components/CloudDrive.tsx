import React, { useState, useEffect } from 'react';
import { CloudDocument } from '../types';

interface CloudDriveProps {
  documents: CloudDocument[];
  onOpen: (doc: CloudDocument) => void;
  onDelete: (id: string) => void;
}

interface Folder {
  id: string;
  name: string;
}

const CloudDrive: React.FC<CloudDriveProps> = ({ documents, onOpen, onDelete }) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingDocId, setMovingDocId] = useState<string | null>(null);

  useEffect(() => {
    const savedFolders = localStorage.getItem('edu_cloud_folders');
    if (savedFolders) setFolders(JSON.parse(savedFolders));
    const savedMap = localStorage.getItem('edu_cloud_doc_map');
    if (savedMap) setFolderMap(JSON.parse(savedMap));
  }, []);

  const saveFolders = (newFolders: Folder[]) => {
    setFolders(newFolders);
    localStorage.setItem('edu_cloud_folders', JSON.stringify(newFolders));
  };

  const saveMap = (newMap: Record<string, string>) => {
    setFolderMap(newMap);
    localStorage.setItem('edu_cloud_doc_map', JSON.stringify(newMap));
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder = { id: `f-${Date.now()}`, name: newFolderName.trim() };
    saveFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Xóa thư mục này? Tài liệu bên trong sẽ được chuyển ra ngoài.')) {
      saveFolders(folders.filter(f => f.id !== id));
      const newMap = { ...folderMap };
      Object.keys(newMap).forEach(docId => {
        if (newMap[docId] === id) delete newMap[docId];
      });
      saveMap(newMap);
    }
  };

  const handleMoveDoc = (docId: string, targetFolderId: string | null) => {
    const newMap = { ...folderMap };
    if (targetFolderId) {
      newMap[docId] = targetFolderId;
    } else {
      delete newMap[docId];
    }
    saveMap(newMap);
    setMovingDocId(null);
  };

  const currentDocs = documents.filter(doc => {
    const fId = folderMap[doc.id] || null;
    return fId === currentFolderId;
  });

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            {currentFolderId && (
              <button onClick={() => setCurrentFolderId(null)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                <i className="fas fa-arrow-left text-lg"></i>
              </button>
            )}
            <h2 className="text-xl font-black text-slate-800">
              {currentFolderId ? folders.find(f => f.id === currentFolderId)?.name : 'Thư viện Tài liệu'}
            </h2>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {currentFolderId ? 'Danh sách tài liệu trong thư mục' : 'Nơi lưu trữ an toàn các tài liệu Thầy Cô đã tạo.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {!currentFolderId && (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-all"
            >
              <i className="fas fa-folder-plus mr-2"></i>Tạo Thư mục
            </button>
          )}
          <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center">
            <i className="fas fa-lock mr-2 text-[8px]"></i>
            Mã hóa
          </div>
        </div>
      </div>

      {isCreatingFolder && (
        <div className="flex items-center space-x-2 p-4 bg-slate-50 rounded-2xl border border-slate-200 animate-in slide-in-from-top-2">
          <i className="fas fa-folder text-indigo-400 text-xl ml-2"></i>
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="Nhập tên thư mục (VD: Toán, Tiếng Việt...)"
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setIsCreatingFolder(false); }}
          />
          <button onClick={handleCreateFolder} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">Tạo</button>
          <button onClick={() => setIsCreatingFolder(false)} className="px-4 py-2 bg-white text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-100">Hủy</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!currentFolderId && folders.map(folder => (
          <div
            key={folder.id}
            onClick={() => setCurrentFolderId(folder.id)}
            className="group bg-indigo-50/50 p-5 rounded-[32px] border border-indigo-100 hover:border-indigo-300 hover:shadow-lg transition-all cursor-pointer relative flex items-center space-x-4"
          >
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm group-hover:scale-110 transition-transform">
              <i className="fas fa-folder text-2xl"></i>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-black text-slate-800 truncate">{folder.name}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                {Object.values(folderMap).filter(fid => fid === folder.id).length} tài liệu
              </p>
            </div>
            <button
              onClick={(e) => handleDeleteFolder(folder.id, e)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-all shadow-sm"
            >
              <i className="fas fa-trash-alt text-xs"></i>
            </button>
          </div>
        ))}

        {currentDocs.length > 0 ? (
          currentDocs.map(doc => (
            <div
              key={doc.id}
              className="group bg-white p-5 rounded-[32px] border border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all cursor-pointer relative"
              onClick={() => onOpen(doc)}
            >
              <div className="absolute top-4 right-4 flex items-center space-x-2">
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMovingDocId(movingDocId === doc.id ? null : doc.id); }}
                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${movingDocId === doc.id ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'}`}
                    title="Di chuyển"
                  >
                    <i className="fas fa-folder-open text-[10px]"></i>
                  </button>
                  {movingDocId === doc.id && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-20 animate-in fade-in zoom-in-95">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2">Chuyển đến:</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                        {currentFolderId && (
                          <button onClick={(e) => { e.stopPropagation(); handleMoveDoc(doc.id, null); }} className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center">
                            <i className="fas fa-home mr-2 text-slate-400"></i>Thư viện (Gốc)
                          </button>
                        )}
                        {folders.filter(f => f.id !== currentFolderId).map(f => (
                          <button key={f.id} onClick={(e) => { e.stopPropagation(); handleMoveDoc(doc.id, f.id); }} className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center">
                            <i className="fas fa-folder mr-2 text-indigo-300"></i>{f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {doc.isEncrypted && (
                  <div className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-500" title="Đã mã hóa an toàn">
                    <i className="fas fa-lock text-[10px]"></i>
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all"
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
        ) : !currentFolderId && folders.length === 0 ? (
          <div className="col-span-full py-24 flex flex-col items-center justify-center text-slate-200 border-4 border-dashed border-slate-50 rounded-[48px]">
            <i className="fas fa-shield-halved text-6xl mb-4 opacity-10"></i>
            <p className="text-[11px] font-black uppercase tracking-[0.4em]">Kênh lưu trữ riêng tư chưa có dữ liệu</p>
            <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Thầy Cô có thể yên tâm đồng bộ mọi thông tin bài giảng</p>
          </div>
        ) : currentDocs.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-300">
            <i className="fas fa-folder-open text-4xl mb-2 opacity-20"></i>
            <p className="text-[10px] font-bold uppercase tracking-widest">Thư mục trống</p>
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
