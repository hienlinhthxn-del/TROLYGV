import React, { useState } from 'react';
import { generateWorksheetContent } from '../services/geminiService';
import { generate_image } from '../services/imageService';

interface WorksheetQuestion {
    id: string;
    type: 'coloring' | 'matching' | 'circle' | 'fill-blank' | 'counting';
    question: string;
    imagePrompt?: string;
    imageUrl?: string;
    options?: string[];
    answer?: string;
}

interface Worksheet {
    title: string;
    subject: string;
    questions: WorksheetQuestion[];
}

const WorksheetCreator: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [subject, setSubject] = useState('Toán');
    const [questionCount, setQuestionCount] = useState(5);
    const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [progress, setProgress] = useState('');

    const questionTypes = [
        { value: 'coloring', label: '🎨 Tô màu', icon: '🖍️' },
        { value: 'matching', label: '🔗 Nối', icon: '↔️' },
        { value: 'circle', label: '⭕ Khoanh tròn', icon: '⭕' },
        { value: 'fill-blank', label: '✏️ Điền từ', icon: '📝' },
        { value: 'counting', label: '🔢 Đếm số', icon: '🔢' }
    ];

    const subjects = ['Toán', 'Tiếng Việt', 'Tự nhiên & Xã hội', 'Đạo đức', 'Âm nhạc', 'Mỹ thuật'];

    const handleGenerate = async () => {
        if (!topic.trim()) {
            alert('Vui lòng nhập chủ đề!');
            return;
        }

        setIsGenerating(true);
        setProgress('Đang tạo phiếu học tập...');

        try {
            // Gọi AI để tạo nội dung phiếu học tập
            const content = await generateWorksheetContent(topic, subject, questionCount);
            setWorksheet(content);
            setProgress('Đã tạo xong nội dung!');

            // Tạo hình ảnh cho các câu hỏi
            await generateImages(content);
        } catch (error) {
            console.error('Lỗi khi tạo phiếu học tập:', error);
            alert('Có lỗi xảy ra khi tạo phiếu học tập. Vui lòng thử lại!');
        } finally {
            setIsGenerating(false);
        }
    };

    const generateImages = async (ws: Worksheet) => {
        setIsGeneratingImages(true);
        const updatedQuestions = [...ws.questions];

        try {
            for (let i = 0; i < updatedQuestions.length; i++) {
                const q = updatedQuestions[i];
                if (q.imagePrompt) {
                    setProgress(`Đang tạo hình ảnh ${i + 1}/${updatedQuestions.length}...`);
                    try {
                        const imageUrl = await generate_image(q.imagePrompt);
                        updatedQuestions[i].imageUrl = imageUrl;
                        setWorksheet({ ...ws, questions: [...updatedQuestions] });
                    } catch (error) {
                        console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    }
                }
            }
            setProgress('Hoàn thành!');
        } finally {
            setIsGeneratingImages(false);
        }
    };

    const handleExportPDF = () => {
        if (!worksheet) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${worksheet.title}</title>
        <style>
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            font-family: 'Comic Sans MS', 'Arial', sans-serif;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20px;
            background: white;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #FF6B9D;
            padding-bottom: 15px;
          }
          .header h1 {
            color: #FF6B9D;
            font-size: 32px;
            margin: 10px 0;
            text-transform: uppercase;
          }
          .header .subject {
            color: #4ECDC4;
            font-size: 20px;
            font-weight: bold;
          }
          .student-info {
            margin: 20px 0;
            padding: 15px;
            background: linear-gradient(135deg, #FFF9C4 0%, #FFE082 100%);
            border-radius: 15px;
            border: 2px dashed #FFA726;
          }
          .student-info p {
            font-size: 18px;
            margin: 8px 0;
            font-weight: bold;
          }
          .question {
            margin: 30px 0;
            padding: 20px;
            background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%);
            border-radius: 20px;
            border: 3px solid #42A5F5;
            page-break-inside: avoid;
          }
          .question-header {
            font-size: 22px;
            font-weight: bold;
            color: #1976D2;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .question-number {
            background: #FF6B9D;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
          }
          .question-text {
            font-size: 20px;
            line-height: 1.8;
            color: #333;
            margin: 15px 0;
          }
          .question-image {
            text-align: center;
            margin: 20px 0;
          }
          .question-image img {
            max-width: 100%;
            max-height: 300px;
            border-radius: 15px;
            border: 3px solid #4ECDC4;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          }
          .options {
            margin: 15px 0;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }
          .option {
            padding: 15px;
            background: white;
            border: 3px solid #4ECDC4;
            border-radius: 15px;
            font-size: 18px;
            font-weight: bold;
            color: #333;
          }
          .answer-space {
            margin: 20px 0;
            padding: 20px;
            background: white;
            border: 3px dashed #FF6B9D;
            border-radius: 15px;
            min-height: 80px;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #C8E6C9 0%, #A5D6A7 100%);
            border-radius: 15px;
            border: 3px solid #66BB6A;
          }
          .footer p {
            font-size: 18px;
            color: #2E7D32;
            font-weight: bold;
            margin: 5px 0;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🌟 ${worksheet.title} 🌟</h1>
          <div class="subject">Môn: ${worksheet.subject}</div>
        </div>
        
        <div class="student-info">
          <p>👤 Họ và tên: ___________________________________</p>
          <p>🏫 Lớp: ___________</p>
          <p>📅 Ngày làm bài: ___________</p>
        </div>

        ${worksheet.questions.map((q, index) => `
          <div class="question">
            <div class="question-header">
              <div class="question-number">${index + 1}</div>
              <span>${getQuestionTypeIcon(q.type)} ${getQuestionTypeLabel(q.type)}</span>
            </div>
            <div class="question-text">${q.question}</div>
            ${q.imageUrl ? `
              <div class="question-image">
                <img src="${q.imageUrl}" alt="Hình minh họa" />
              </div>
            ` : ''}
            ${q.options ? `
              <div class="options">
                ${q.options.map(opt => `<div class="option">${opt}</div>`).join('')}
              </div>
            ` : ''}
            <div class="answer-space">
              <strong>Trả lời:</strong>
            </div>
          </div>
        `).join('')}

        <div class="footer">
          <p>⭐ Chúc em học tốt! ⭐</p>
          <p>💪 Hãy cố gắng hết mình nhé! 💪</p>
        </div>
      </body>
      </html>
    `;

        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    };

    const getQuestionTypeIcon = (type: string) => {
        const typeMap: { [key: string]: string } = {
            'coloring': '🎨',
            'matching': '🔗',
            'circle': '⭕',
            'fill-blank': '✏️',
            'counting': '🔢'
        };
        return typeMap[type] || '📝';
    };

    const getQuestionTypeLabel = (type: string) => {
        const typeMap: { [key: string]: string } = {
            'coloring': 'Tô màu',
            'matching': 'Nối',
            'circle': 'Khoanh tròn',
            'fill-blank': 'Điền từ',
            'counting': 'Đếm số'
        };
        return typeMap[type] || 'Câu hỏi';
    };

    return (
        <div style={{
            padding: '30px',
            maxWidth: '1200px',
            margin: '0 auto',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            minHeight: '100vh'
        }}>
            <div style={{
                background: 'white',
                borderRadius: '25px',
                padding: '40px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
                {/* Header */}
                <div style={{
                    textAlign: 'center',
                    marginBottom: '40px',
                    borderBottom: '4px solid #FF6B9D',
                    paddingBottom: '20px'
                }}>
                    <h1 style={{
                        fontSize: '42px',
                        background: 'linear-gradient(135deg, #FF6B9D 0%, #4ECDC4 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: '0 0 10px 0',
                        fontWeight: 'bold'
                    }}>
                        📚 Tạo Phiếu Học Tập Lớp 1
                    </h1>
                    <p style={{
                        fontSize: '18px',
                        color: '#666',
                        margin: 0
                    }}>
                        Tạo phiếu học tập với hình ảnh sinh động, phù hợp với học sinh lớp 1
                    </p>
                </div>

                {/* Form tạo phiếu */}
                {!worksheet && (
                    <div style={{
                        background: 'linear-gradient(135deg, #FFF9C4 0%, #FFE082 100%)',
                        padding: '30px',
                        borderRadius: '20px',
                        border: '3px solid #FFA726',
                        marginBottom: '30px'
                    }}>
                        <div style={{ marginBottom: '25px' }}>
                            <label style={{
                                display: 'block',
                                fontSize: '20px',
                                fontWeight: 'bold',
                                color: '#E65100',
                                marginBottom: '10px'
                            }}>
                                📖 Môn học:
                            </label>
                            <select
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '15px',
                                    fontSize: '18px',
                                    border: '3px solid #FF9800',
                                    borderRadius: '15px',
                                    background: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                {subjects.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '25px' }}>
                            <label style={{
                                display: 'block',
                                fontSize: '20px',
                                fontWeight: 'bold',
                                color: '#E65100',
                                marginBottom: '10px'
                            }}>
                                💡 Chủ đề:
                            </label>
                            <input
                                type="text"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="VD: Đếm số từ 1 đến 10, Nhận biết màu sắc, Bảng chữ cái..."
                                style={{
                                    width: '100%',
                                    padding: '15px',
                                    fontSize: '18px',
                                    border: '3px solid #FF9800',
                                    borderRadius: '15px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '25px' }}>
                            <label style={{
                                display: 'block',
                                fontSize: '20px',
                                fontWeight: 'bold',
                                color: '#E65100',
                                marginBottom: '10px'
                            }}>
                                🔢 Số lượng câu hỏi:
                            </label>
                            <input
                                type="number"
                                value={questionCount}
                                onChange={(e) => setQuestionCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                                min="1"
                                max="10"
                                style={{
                                    width: '100%',
                                    padding: '15px',
                                    fontSize: '18px',
                                    border: '3px solid #FF9800',
                                    borderRadius: '15px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !topic.trim()}
                            style={{
                                width: '100%',
                                padding: '20px',
                                fontSize: '22px',
                                fontWeight: 'bold',
                                background: isGenerating
                                    ? 'linear-gradient(135deg, #BDBDBD 0%, #9E9E9E 100%)'
                                    : 'linear-gradient(135deg, #FF6B9D 0%, #4ECDC4 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '15px',
                                cursor: isGenerating ? 'not-allowed' : 'pointer',
                                boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                                transition: 'all 0.3s ease',
                                transform: isGenerating ? 'scale(0.98)' : 'scale(1)'
                            }}
                            onMouseEnter={(e) => {
                                if (!isGenerating) {
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                    e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.3)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isGenerating) {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
                                }
                            }}
                        >
                            {isGenerating ? '⏳ Đang tạo phiếu học tập...' : '✨ Tạo Phiếu Học Tập'}
                        </button>

                        {progress && (
                            <div style={{
                                marginTop: '20px',
                                padding: '15px',
                                background: 'white',
                                borderRadius: '10px',
                                border: '2px solid #4ECDC4',
                                textAlign: 'center',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                color: '#1976D2'
                            }}>
                                {progress}
                            </div>
                        )}
                    </div>
                )}

                {/* Hiển thị phiếu học tập */}
                {worksheet && (
                    <div>
                        <div style={{
                            background: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
                            padding: '30px',
                            borderRadius: '20px',
                            border: '3px solid #42A5F5',
                            marginBottom: '30px'
                        }}>
                            <h2 style={{
                                fontSize: '32px',
                                color: '#1976D2',
                                textAlign: 'center',
                                margin: '0 0 20px 0'
                            }}>
                                {worksheet.title}
                            </h2>
                            <p style={{
                                fontSize: '20px',
                                color: '#0D47A1',
                                textAlign: 'center',
                                fontWeight: 'bold',
                                margin: 0
                            }}>
                                Môn: {worksheet.subject}
                            </p>
                        </div>

                        {worksheet.questions.map((q, index) => (
                            <div key={q.id} style={{
                                background: 'linear-gradient(135deg, #FFF9C4 0%, #FFE082 100%)',
                                padding: '25px',
                                borderRadius: '20px',
                                border: '3px solid #FFA726',
                                marginBottom: '25px'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '15px',
                                    marginBottom: '15px'
                                }}>
                                    <div style={{
                                        background: '#FF6B9D',
                                        color: 'white',
                                        width: '50px',
                                        height: '50px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '28px',
                                        fontWeight: 'bold'
                                    }}>
                                        {index + 1}
                                    </div>
                                    <div style={{
                                        fontSize: '22px',
                                        fontWeight: 'bold',
                                        color: '#E65100'
                                    }}>
                                        {getQuestionTypeIcon(q.type)} {getQuestionTypeLabel(q.type)}
                                    </div>
                                </div>

                                <div style={{
                                    fontSize: '20px',
                                    color: '#333',
                                    marginBottom: '15px',
                                    lineHeight: '1.6'
                                }}>
                                    {q.question}
                                </div>

                                {q.imageUrl && (
                                    <div style={{
                                        textAlign: 'center',
                                        margin: '20px 0'
                                    }}>
                                        <img
                                            src={q.imageUrl}
                                            alt="Hình minh họa"
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: '300px',
                                                borderRadius: '15px',
                                                border: '3px solid #4ECDC4',
                                                boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                                            }}
                                        />
                                    </div>
                                )}

                                {q.options && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                        gap: '15px',
                                        marginTop: '15px'
                                    }}>
                                        {q.options.map((opt, i) => (
                                            <div key={i} style={{
                                                padding: '15px',
                                                background: 'white',
                                                border: '3px solid #4ECDC4',
                                                borderRadius: '15px',
                                                fontSize: '18px',
                                                fontWeight: 'bold',
                                                textAlign: 'center'
                                            }}>
                                                {opt}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Nút hành động */}
                        <div style={{
                            display: 'flex',
                            gap: '20px',
                            marginTop: '30px'
                        }}>
                            <button
                                onClick={handleExportPDF}
                                disabled={isGeneratingImages}
                                style={{
                                    flex: 1,
                                    padding: '20px',
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    background: isGeneratingImages
                                        ? 'linear-gradient(135deg, #BDBDBD 0%, #9E9E9E 100%)'
                                        : 'linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '15px',
                                    cursor: isGeneratingImages ? 'wait' : 'pointer',
                                    boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                                    transition: 'all 0.3s ease'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isGeneratingImages) {
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isGeneratingImages) {
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }
                                }}
                            >
                                {isGeneratingImages ? `⏳ Đang tạo ảnh (${progress.split(' ')[2]})...` : '🖨️ Xuất PDF & In Phiếu Học Tập'}
                            </button>

                            <button
                                onClick={() => {
                                    setWorksheet(null);
                                    setProgress('');
                                }}
                                style={{
                                    flex: 1,
                                    padding: '20px',
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    background: 'linear-gradient(135deg, #FF6B9D 0%, #C2185B 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '15px',
                                    cursor: 'pointer',
                                    boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                                    transition: 'all 0.3s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                🔄 Tạo Phiếu Mới
                            </button>
                        </div>
                    </div>
                )}

                {/* Hướng dẫn */}
                <div style={{
                    marginTop: '40px',
                    padding: '25px',
                    background: 'linear-gradient(135deg, #C8E6C9 0%, #A5D6A7 100%)',
                    borderRadius: '20px',
                    border: '3px solid #66BB6A'
                }}>
                    <h3 style={{
                        fontSize: '24px',
                        color: '#2E7D32',
                        margin: '0 0 15px 0'
                    }}>
                        💡 Hướng dẫn sử dụng:
                    </h3>
                    <ul style={{
                        fontSize: '16px',
                        color: '#1B5E20',
                        lineHeight: '1.8',
                        margin: 0,
                        paddingLeft: '25px'
                    }}>
                        <li>Chọn môn học và nhập chủ đề bài học</li>
                        <li>Chọn số lượng câu hỏi (1-10 câu)</li>
                        <li>Nhấn "Tạo Phiếu Học Tập" và đợi AI tạo nội dung</li>
                        <li>Hệ thống sẽ tự động tạo hình ảnh minh họa phù hợp</li>
                        <li>Nhấn "In Phiếu Học Tập" để xuất PDF và in ra</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default WorksheetCreator;
