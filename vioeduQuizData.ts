// Bộ đề chuẩn VioEdu / Violympic Toán Lớp 1 (30 câu từ file PDF của giáo viên)
// Hỗ trợ hình ảnh SVG trực quan ở cả câu hỏi và đáp án, cùng dạng câu hỏi Điền số & Trắc nghiệm 2x2

export interface VioEduQuizItem {
  id: string;
  type: 'Trắc nghiệm' | 'Tự luận';
  question: string;
  image: string;
  options: Array<{ text: string; image: string }>;
  answer: string;
  explanation: string;
}

const makeOrangesSvg = (count: number) => {
  const topRow = Math.floor(count / 2);
  const bottomRow = count - topRow;
  let items = '';
  for (let i = 0; i < topRow; i++) {
    const cx = 42 + i * 38;
    items += `
      <g transform="translate(${cx}, 28)">
        <circle cx="0" cy="4" r="14" fill="#f97316" stroke="#ea580c" stroke-width="1.5"/>
        <circle cx="-4" cy="0" r="3" fill="#fdba74" opacity="0.6"/>
        <path d="M0,-10 Q8,-18 14,-10 Q6,-6 0,-10 Z" fill="#16a34a"/>
      </g>`;
  }
  for (let i = 0; i < bottomRow; i++) {
    const cx = 34 + i * 38;
    items += `
      <g transform="translate(${cx}, 66)">
        <circle cx="0" cy="4" r="14" fill="#f97316" stroke="#ea580c" stroke-width="1.5"/>
        <circle cx="-4" cy="0" r="3" fill="#fdba74" opacity="0.6"/>
        <path d="M0,-10 Q8,-18 14,-10 Q6,-6 0,-10 Z" fill="#16a34a"/>
      </g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" width="240" height="96">
    <rect x="4" y="4" width="232" height="88" rx="14" fill="#f5ead8" stroke="#e7d5b8" stroke-width="2"/>
    ${items}
  </svg>`;
};

const makeColorStripsSvg = (colors: [string, string, string, string]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96" width="120" height="96">
    <rect x="16" y="8" width="56" height="16" rx="2" fill="${colors[0]}"/>
    <rect x="16" y="28" width="56" height="16" rx="2" fill="${colors[1]}"/>
    <rect x="16" y="48" width="56" height="16" rx="2" fill="${colors[2]}"/>
    <rect x="16" y="68" width="56" height="16" rx="2" fill="${colors[3]}"/>
  </svg>`;

const makeWalletAdditionSvg = (a: number, b: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 100" width="340" height="100">
    <g transform="translate(10,10)">
      <rect x="0" y="0" width="80" height="80" rx="10" fill="#d97706" stroke="#92400e" stroke-width="4"/>
      <circle cx="40" cy="40" r="30" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>
      <text x="40" y="52" text-anchor="middle" font-size="34" font-weight="900" fill="#1e293b" font-family="Arial">${a}</text>
    </g>
    <text x="110" y="62" text-anchor="middle" font-size="36" font-weight="900" fill="#1e293b" font-family="Arial">+</text>
    <g transform="translate(130,10)">
      <rect x="0" y="0" width="80" height="80" rx="10" fill="#d97706" stroke="#92400e" stroke-width="4"/>
      <circle cx="40" cy="40" r="30" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>
      <text x="40" y="52" text-anchor="middle" font-size="34" font-weight="900" fill="#1e293b" font-family="Arial">${b}</text>
    </g>
    <text x="230" y="62" text-anchor="middle" font-size="36" font-weight="900" fill="#1e293b" font-family="Arial">=</text>
    <g transform="translate(250,10)">
      <rect x="0" y="0" width="80" height="80" rx="10" fill="#d97706" stroke="#92400e" stroke-width="4"/>
      <circle cx="40" cy="40" r="30" fill="#fffbeb" stroke="#b45309" stroke-width="2"/>
    </g>
  </svg>`;

const makeRobotSvg = (missingLeftHand = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 240" width="240" height="220">
    <!-- Đầu tròn vàng -->
    <circle cx="130" cy="34" r="22" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
    <!-- Cổ vuông xanh lá -->
    <rect x="116" y="58" width="28" height="26" fill="#84cc16" stroke="#1e293b" stroke-width="2"/>
    <!-- Tay trái chữ nhật xanh lá -->
    <rect x="52" y="84" width="46" height="16" fill="#84cc16" stroke="#1e293b" stroke-width="2"/>
    ${!missingLeftHand ? '<circle cx="42" cy="92" r="10" fill="#facc15" stroke="#1e293b" stroke-width="2"/>' : ''}
    <!-- Tay phải chữ nhật xanh lá + bàn tay tròn vàng -->
    <rect x="162" y="84" width="46" height="16" fill="#84cc16" stroke="#1e293b" stroke-width="2"/>
    <circle cx="218" cy="92" r="10" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
    <!-- Thân vuông cam -->
    <rect x="98" y="84" width="64" height="62" fill="#f97316" stroke="#1e293b" stroke-width="2"/>
    <!-- 2 chân chữ nhật xanh lá -->
    <rect x="98" y="146" width="22" height="58" fill="#84cc16" stroke="#1e293b" stroke-width="2"/>
    <rect x="140" y="146" width="22" height="58" fill="#84cc16" stroke="#1e293b" stroke-width="2"/>
    <!-- 2 bàn chân tam giác vàng -->
    <polygon points="109,204 94,226 124,226" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
    <polygon points="151,204 136,226 166,226" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
  </svg>`;

export const VIOEDU_GRADE1_SAMPLE_30: VioEduQuizItem[] = [
  {
    id: 'vio-1',
    type: 'Trắc nghiệm',
    question: 'Đồ vật nào dưới đây không giống hình tròn?',
    image: '',
    options: [
      {
        text: 'Cúc áo',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="90" height="90"><circle cx="50" cy="50" r="38" fill="#d946ef" stroke="#a21caf" stroke-width="5"/><circle cx="38" cy="38" r="5" fill="#fff"/><circle cx="62" cy="38" r="5" fill="#fff"/><circle cx="38" cy="62" r="5" fill="#fff"/><circle cx="62" cy="62" r="5" fill="#fff"/></svg>`
      },
      {
        text: 'Bánh mì',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" width="100" height="90"><g transform="rotate(25 60 50)"><ellipse cx="60" cy="50" rx="44" ry="22" fill="#facc15" stroke="#ca8a04" stroke-width="3"/><line x1="40" y1="36" x2="48" y2="54" stroke="#ca8a04" stroke-width="3" stroke-linecap="round"/><line x1="56" y1="34" x2="64" y2="54" stroke="#ca8a04" stroke-width="3" stroke-linecap="round"/><line x1="72" y1="36" x2="80" y2="54" stroke="#ca8a04" stroke-width="3" stroke-linecap="round"/></g></svg>`
      },
      {
        text: 'Đồng hồ',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="90" height="90"><circle cx="50" cy="50" r="38" fill="#7dd3fc" stroke="#0284c7" stroke-width="5"/><line x1="50" y1="50" x2="50" y2="26" stroke="#1e293b" stroke-width="4" stroke-linecap="round"/><line x1="50" y1="50" x2="70" y2="50" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="3" fill="#1e293b"/></svg>`
      },
      {
        text: 'Bánh xe',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="90" height="90"><circle cx="50" cy="50" r="36" fill="#3b82f6" stroke="#1e3a8a" stroke-width="10"/><circle cx="50" cy="50" r="18" fill="#dbeafe"/><circle cx="50" cy="50" r="6" fill="#1e3a8a"/></svg>`
      }
    ],
    answer: 'B',
    explanation: 'Ổ bánh mì có dạng thuôn dài (hình bầu dục), không giống hình tròn.'
  },
  {
    id: 'vio-2',
    type: 'Trắc nghiệm',
    question: 'Tính: 6 + 3 = ?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="300" height="110">
      <g transform="translate(25,10)">
        <path d="M25,5 Q35,20 25,30 Q15,20 25,5 Z" fill="#f97316"/>
        <rect x="10" y="32" width="30" height="50" rx="6" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>
        <text x="25" y="64" text-anchor="middle" font-size="22" font-weight="900" fill="#1e293b">6</text>
        <rect x="4" y="82" width="42" height="10" rx="4" fill="#eab308"/>
      </g>
      <text x="105" y="68" text-anchor="middle" font-size="32" font-weight="900" fill="#1e293b">+</text>
      <g transform="translate(135,10)">
        <path d="M25,5 Q35,20 25,30 Q15,20 25,5 Z" fill="#f97316"/>
        <rect x="10" y="32" width="30" height="50" rx="6" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>
        <text x="25" y="64" text-anchor="middle" font-size="22" font-weight="900" fill="#1e293b">3</text>
        <rect x="4" y="82" width="42" height="10" rx="4" fill="#eab308"/>
      </g>
      <text x="215" y="68" text-anchor="middle" font-size="32" font-weight="900" fill="#1e293b">=</text>
      <g transform="translate(245,10)">
        <path d="M25,5 Q35,20 25,30 Q15,20 25,5 Z" fill="#f97316"/>
        <rect x="10" y="32" width="30" height="50" rx="6" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>
        <circle cx="25" cy="57" r="12" fill="#fff" stroke="#ca8a04" stroke-width="1.5"/>
        <rect x="4" y="82" width="42" height="10" rx="4" fill="#eab308"/>
      </g>
    </svg>`,
    options: [
      { text: '6', image: '' },
      { text: '8', image: '' },
      { text: '7', image: '' },
      { text: '9', image: '' }
    ],
    answer: 'D',
    explanation: '6 cộng 3 bằng 9.'
  },
  {
    id: 'vio-3',
    type: 'Tự luận',
    question: 'Từ 7 đếm thêm 2 được mấy? Trả lời: ...',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 90" width="320" height="85">
      ${Array.from({ length: 9 }, (_, i) => {
        const x = 18 + i * 35;
        const label = i < 7 ? String(i + 1) : i === 8 ? '?' : '';
        return `<rect x="${x}" y="12" width="14" height="42" fill="#84cc16" rx="2"/>
                <text x="${x + 7}" y="76" text-anchor="middle" font-size="16" font-weight="bold" fill="#1e293b">${label}</text>`;
      }).join('')}
      <path d="M235,58 Q252,70 270,58" fill="none" stroke="#dc2626" stroke-width="2.5"/>
      <path d="M270,58 Q287,70 305,58" fill="none" stroke="#dc2626" stroke-width="2.5"/>
    </svg>`,
    options: [],
    answer: '9',
    explanation: 'Từ 7 đếm thêm 2: 7 -> 8 -> 9. Vậy kết quả là 9.'
  },
  {
    id: 'vio-4',
    type: 'Trắc nghiệm',
    question: 'Tính: 8 + 2 = ?',
    image: makeWalletAdditionSvg(8, 2),
    options: [
      { text: '8', image: '' },
      { text: '10', image: '' },
      { text: '9', image: '' },
      { text: '7', image: '' }
    ],
    answer: 'B',
    explanation: '8 + 2 = 10.'
  },
  {
    id: 'vio-5',
    type: 'Trắc nghiệm',
    question: 'Tính: 3 + 3 = ?',
    image: makeWalletAdditionSvg(3, 3),
    options: [
      { text: '7', image: '' },
      { text: '9', image: '' },
      { text: '8', image: '' },
      { text: '6', image: '' }
    ],
    answer: 'D',
    explanation: '3 + 3 = 6.'
  },
  {
    id: 'vio-6',
    type: 'Tự luận',
    question: 'Số cần điền vào dấu hỏi chấm là ...',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180" width="340" height="170">
      ${[2, 5, 3, 7].map((coloredCount, colIdx) => {
        const bx = 12 + colIdx * 86;
        let boxes = '';
        for (let i = 0; i < 10; i++) {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const x = bx + 10 + col * 30;
          const y = 12 + row * 24;
          const isColored = i < coloredCount;
          boxes += `<rect x="${x}" y="${y}" width="20" height="18" rx="3" fill="${isColored ? '#ef4444' : '#cbd5e1'}"/>
                    <rect x="${x + 8}" y="${y}" width="4" height="18" fill="${isColored ? '#22c55e' : '#94a3b8'}"/>`;
        }
        const label = colIdx === 3 ? '?' : String(coloredCount);
        const labelColor = colIdx === 3 ? '#dc2626' : '#93c5fd';
        return `<rect x="${bx}" y="4" width="76" height="132" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
                ${boxes}
                <rect x="${bx}" y="142" width="76" height="32" rx="8" fill="#fff" stroke="#e2e8f0" stroke-width="2"/>
                <text x="${bx + 38}" y="165" text-anchor="middle" font-size="22" font-weight="900" fill="${labelColor}">${label}</text>`;
      }).join('')}
    </svg>`,
    options: [],
    answer: '7',
    explanation: 'Ở cột thứ 4 có 7 hộp quà được tô màu, nên số cần điền là 7.'
  },
  {
    id: 'vio-7',
    type: 'Trắc nghiệm',
    question: 'Tính theo hình vẽ: 2 + 1 = ___',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="300" height="110">
      <rect x="10" y="10" width="90" height="60" rx="6" fill="#fff" stroke="#65a30d" stroke-width="2"/>
      <circle cx="38" cy="32" r="11" fill="#84cc16"/><circle cx="68" cy="48" r="11" fill="#84cc16"/>
      <rect x="100" y="10" width="80" height="60" rx="6" fill="#fff" stroke="#65a30d" stroke-width="2"/>
      <circle cx="140" cy="40" r="11" fill="#84cc16"/>
      <rect x="180" y="10" width="120" height="60" rx="6" fill="#fff" stroke="#65a30d" stroke-width="2"/>
      <circle cx="210" cy="28" r="11" fill="#84cc16"/><circle cx="240" cy="50" r="11" fill="#84cc16"/><circle cx="270" cy="28" r="11" fill="#84cc16"/>
      <text x="140" y="105" text-anchor="middle" font-size="28" font-weight="900" fill="#4d7c0f">2  +  1  =  ___</text>
    </svg>`,
    options: [
      { text: '3', image: '' },
      { text: '2', image: '' },
      { text: '1', image: '' },
      { text: '4', image: '' }
    ],
    answer: 'A',
    explanation: '2 thêm 1 bằng 3.'
  },
  {
    id: 'vio-8',
    type: 'Trắc nghiệm',
    question: 'Số nào dưới đây nhỏ nhất?',
    image: '',
    options: [
      { text: 'Số 3', image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="70" height="70"><text x="40" y="62" text-anchor="middle" font-size="60" font-weight="900" fill="#eab308">3</text></svg>` },
      { text: 'Số 2', image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="70" height="70"><text x="40" y="62" text-anchor="middle" font-size="60" font-weight="900" fill="#3b82f6">2</text></svg>` },
      { text: 'Số 0', image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="70" height="70"><text x="40" y="62" text-anchor="middle" font-size="60" font-weight="900" fill="#f59e0b">0</text></svg>` },
      { text: 'Số 1', image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="70" height="70"><text x="40" y="62" text-anchor="middle" font-size="60" font-weight="900" fill="#e11d48">1</text></svg>` }
    ],
    answer: 'C',
    explanation: 'Trong các số 3, 2, 0, 1 thì số 0 là số nhỏ nhất.'
  },
  {
    id: 'vio-9',
    type: 'Trắc nghiệm',
    question: 'Tính theo hình vẽ: 2 + 3 = ___',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="300" height="110">
      <rect x="10" y="10" width="90" height="60" rx="6" fill="#fff" stroke="#3b82f6" stroke-width="2"/>
      <text x="55" y="48" text-anchor="middle" font-size="24">🛰️ 🛰️</text>
      <rect x="100" y="10" width="90" height="60" rx="6" fill="#fff" stroke="#3b82f6" stroke-width="2"/>
      <text x="145" y="48" text-anchor="middle" font-size="20">🛰️ 🛰️ 🛰️</text>
      <rect x="190" y="10" width="120" height="60" rx="6" fill="#fff" stroke="#3b82f6" stroke-width="2"/>
      <text x="250" y="48" text-anchor="middle" font-size="18">🛰️🛰️🛰️🛰️🛰️</text>
      <text x="150" y="105" text-anchor="middle" font-size="28" font-weight="900" fill="#1d4ed8">2  +  3  =  ___</text>
    </svg>`,
    options: [
      { text: '6', image: '' },
      { text: '5', image: '' },
      { text: '8', image: '' },
      { text: '7', image: '' }
    ],
    answer: 'B',
    explanation: '2 + 3 = 5.'
  },
  {
    id: 'vio-10',
    type: 'Trắc nghiệm',
    question: 'Hình nào có 9 quả cam?',
    image: '',
    options: [
      { text: 'Hình A (7 quả)', image: makeOrangesSvg(7) },
      { text: 'Hình B (10 quả)', image: makeOrangesSvg(10) },
      { text: 'Hình C (9 quả)', image: makeOrangesSvg(9) },
      { text: 'Hình D (8 quả)', image: makeOrangesSvg(8) }
    ],
    answer: 'C',
    explanation: 'Hình C có 4 quả ở hàng trên và 5 quả ở hàng dưới, tất cả là 9 quả cam.'
  },
  {
    id: 'vio-11',
    type: 'Trắc nghiệm',
    question: 'Hình nào có 10 quả cam?',
    image: '',
    options: [
      { text: 'Hình A (7 quả)', image: makeOrangesSvg(7) },
      { text: 'Hình B (8 quả)', image: makeOrangesSvg(8) },
      { text: 'Hình C (9 quả)', image: makeOrangesSvg(9) },
      { text: 'Hình D (10 quả)', image: makeOrangesSvg(10) }
    ],
    answer: 'D',
    explanation: 'Hình D có 5 quả hàng trên và 5 quả hàng dưới, tổng cộng 10 quả cam.'
  },
  {
    id: 'vio-12',
    type: 'Tự luận',
    question: 'Tính: 1 + 1 + 1 = ...',
    image: '',
    options: [],
    answer: '3',
    explanation: '1 + 1 + 1 = 3.'
  },
  {
    id: 'vio-13',
    type: 'Trắc nghiệm',
    question: 'Chọn số thích hợp điền vào dấu hỏi chấm: 5 + 2 < [ ? ]',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 70" width="240" height="65">
      <text x="20" y="48" font-size="36" font-weight="900" fill="#15803d" stroke="#f97316" stroke-width="1">5 + 2 &lt;</text>
      <rect x="175" y="14" width="44" height="44" fill="#fff" stroke="#b45309" stroke-width="3"/>
      <text x="197" y="46" text-anchor="middle" font-size="28" font-weight="900" fill="#15803d">?</text>
    </svg>`,
    options: [
      { text: '7', image: '' },
      { text: '8', image: '' },
      { text: '5', image: '' },
      { text: '6', image: '' }
    ],
    answer: 'B',
    explanation: 'Vì 5 + 2 = 7, mà 7 < 8 nên số cần điền là 8.'
  },
  {
    id: 'vio-14',
    type: 'Tự luận',
    question: 'Số thích hợp điền vào quả táo dấu hỏi chấm (?) là ...',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140" width="300" height="130">
      <!-- Nhóm trái: 2 và 7 gộp thành 9 -->
      <line x1="55" y1="40" x2="105" y2="70" stroke="#2563eb" stroke-width="3"/>
      <line x1="55" y1="100" x2="105" y2="70" stroke="#2563eb" stroke-width="3"/>
      <circle cx="45" cy="40" r="22" fill="#fff" stroke="#dc2626" stroke-width="3"/>
      <text x="45" y="48" text-anchor="middle" font-size="22" font-weight="900" fill="#0284c7">2</text>
      <circle cx="45" cy="100" r="22" fill="#fff" stroke="#dc2626" stroke-width="3"/>
      <text x="45" y="108" text-anchor="middle" font-size="22" font-weight="900" fill="#b91c1c">7</text>
      <circle cx="115" cy="70" r="22" fill="#fff" stroke="#dc2626" stroke-width="3"/>
      <text x="115" y="78" text-anchor="middle" font-size="22" font-weight="900" fill="#1d4ed8">9</text>
      <!-- Nhóm phải: 4 và 5 gộp thành ? -->
      <line x1="205" y1="40" x2="255" y2="70" stroke="#16a34a" stroke-width="3"/>
      <line x1="205" y1="100" x2="255" y2="70" stroke="#16a34a" stroke-width="3"/>
      <circle cx="195" cy="40" r="22" fill="#fff" stroke="#eab308" stroke-width="3"/>
      <text x="195" y="48" text-anchor="middle" font-size="22" font-weight="900" fill="#7c2d12">4</text>
      <circle cx="195" cy="100" r="22" fill="#fff" stroke="#eab308" stroke-width="3"/>
      <text x="195" y="108" text-anchor="middle" font-size="22" font-weight="900" fill="#eab308">5</text>
      <circle cx="265" cy="70" r="22" fill="#fff" stroke="#eab308" stroke-width="3"/>
      <text x="265" y="78" text-anchor="middle" font-size="24" font-weight="900" fill="#1e293b">?</text>
    </svg>`,
    options: [],
    answer: '9',
    explanation: '2 gộp với 7 được 9. Tương tự, 4 gộp với 5 được 9 (4 + 5 = 9).'
  },
  {
    id: 'vio-15',
    type: 'Trắc nghiệm',
    question: 'Phép cộng phù hợp với hình trên là:',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 60" width="380" height="55">
      <circle cx="24" cy="30" r="14" fill="#f59e0b" stroke="#1e293b" stroke-width="1.5"/>
      <circle cx="62" cy="30" r="14" fill="#f59e0b" stroke="#1e293b" stroke-width="1.5"/>
      <circle cx="100" cy="30" r="14" fill="#f59e0b" stroke="#1e293b" stroke-width="1.5"/>
      <rect x="126" y="16" width="28" height="28" fill="#84cc16" stroke="#1e293b" stroke-width="1.5"/>
      <rect x="164" y="16" width="28" height="28" fill="#84cc16" stroke="#1e293b" stroke-width="1.5"/>
      <rect x="202" y="16" width="28" height="28" fill="#84cc16" stroke="#1e293b" stroke-width="1.5"/>
      <polygon points="256,14 242,44 270,44" fill="#facc15" stroke="#1e293b" stroke-width="1.5"/>
      <polygon points="294,14 280,44 308,44" fill="#facc15" stroke="#1e293b" stroke-width="1.5"/>
      <polygon points="332,14 318,44 346,44" fill="#facc15" stroke="#1e293b" stroke-width="1.5"/>
      <polygon points="370,14 356,44 384,44" fill="#facc15" stroke="#1e293b" stroke-width="1.5"/>
    </svg>`,
    options: [
      { text: '3 + 3 + 3 = 9', image: '' },
      { text: '3 + 3 + 3 = 10', image: '' },
      { text: '3 + 3 + 4 = 9', image: '' },
      { text: '3 + 3 + 4 = 10', image: '' }
    ],
    answer: 'D',
    explanation: 'Có 3 hình tròn + 3 hình vuông + 4 hình tam giác = 10 hình. Vậy phép tính đúng là 3 + 3 + 4 = 10.'
  },
  {
    id: 'vio-16',
    type: 'Trắc nghiệm',
    question: 'Hình nào nằm bên trong hình vuông?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" width="220" height="110">
      <rect x="10" y="10" width="220" height="100" fill="none" stroke="#1e3a8a" stroke-width="2.5"/>
      <rect x="42" y="22" width="76" height="76" fill="none" stroke="#1e3a8a" stroke-width="2.5"/>
      <circle cx="90" cy="60" r="22" fill="none" stroke="#1e3a8a" stroke-width="2.5"/>
    </svg>`,
    options: [
      { text: 'Hình chữ nhật', image: '' },
      { text: 'Hình tam giác', image: '' },
      { text: 'Hình tròn', image: '' },
      { text: 'Hình vuông', image: '' }
    ],
    answer: 'C',
    explanation: 'Hình tròn nằm ở bên trong hình vuông.'
  },
  {
    id: 'vio-17',
    type: 'Trắc nghiệm',
    question: 'Từ 6 đếm thêm mấy để được 10?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 90" width="350" height="85">
      ${Array.from({ length: 10 }, (_, i) => {
        const x = 18 + i * 35;
        const showNum = i < 6 || i === 9;
        return `<rect x="${x}" y="12" width="14" height="42" fill="#84cc16" rx="2"/>
                ${showNum ? `<text x="${x + 7}" y="76" text-anchor="middle" font-size="16" font-weight="bold" fill="#1e293b">${i + 1}</text>` : ''}`;
      }).join('')}
      <path d="M200,56 Q217,68 235,56" fill="none" stroke="#dc2626" stroke-width="2.5"/>
      <path d="M235,56 Q252,68 270,56" fill="none" stroke="#dc2626" stroke-width="2.5"/>
      <path d="M270,56 Q287,68 305,56" fill="none" stroke="#dc2626" stroke-width="2.5"/>
      <path d="M305,56 Q322,68 340,56" fill="none" stroke="#dc2626" stroke-width="2.5"/>
    </svg>`,
    options: [
      { text: '1', image: '' },
      { text: '2', image: '' },
      { text: '4', image: '' },
      { text: '3', image: '' }
    ],
    answer: 'C',
    explanation: 'Từ 6 đếm thêm 4 bước (7, 8, 9, 10) thì được 10.'
  },
  {
    id: 'vio-18',
    type: 'Trắc nghiệm',
    question: 'Kết quả phép tính trên là:',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="300" height="110">
      <text x="20" y="42" font-size="28" font-weight="bold">🐶 = 1</text>
      <text x="165" y="42" font-size="28" font-weight="bold">🐱 = 2</text>
      <text x="30" y="98" font-size="36" font-weight="900">🐶  +  🐱  =  ?</text>
    </svg>`,
    options: [
      { text: '3', image: '' },
      { text: '2', image: '' },
      { text: '1', image: '' },
      { text: '4', image: '' }
    ],
    answer: 'A',
    explanation: 'Vì 🐶 = 1 và 🐱 = 2 nên 🐶 + 🐱 = 1 + 2 = 3.'
  },
  {
    id: 'vio-19',
    type: 'Tự luận',
    question: 'Số thích hợp điền vào dấu hỏi chấm là ... (5 + ? = 5)',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 70" width="260" height="65">
      <text x="140" y="52" text-anchor="middle" font-size="44" font-weight="900" fill="#eab308" stroke="#16a34a" stroke-width="1">5  +  ?  =  5</text>
    </svg>`,
    options: [],
    answer: '0',
    explanation: '5 + 0 = 5, nên số cần điền là 0.'
  },
  {
    id: 'vio-20',
    type: 'Trắc nghiệm',
    question: 'Chọn số thích hợp điền vào dấu hỏi chấm: 1 + 8 < [ ? ]',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 70" width="240" height="65">
      <text x="20" y="48" font-size="36" font-weight="900" fill="#15803d" stroke="#f97316" stroke-width="1">1 + 8 &lt;</text>
      <rect x="175" y="14" width="44" height="44" fill="#fff" stroke="#b45309" stroke-width="3"/>
      <text x="197" y="46" text-anchor="middle" font-size="28" font-weight="900" fill="#15803d">?</text>
    </svg>`,
    options: [
      { text: '7', image: '' },
      { text: '8', image: '' },
      { text: '9', image: '' },
      { text: '10', image: '' }
    ],
    answer: 'D',
    explanation: '1 + 8 = 9, mà 9 < 10 nên đáp án đúng là 10.'
  },
  {
    id: 'vio-21',
    type: 'Tự luận',
    question: 'Điền số: Hình trên có mấy hình vuông? Trả lời: Hình trên có ... hình vuông.',
    image: makeRobotSvg(false),
    options: [],
    answer: '2',
    explanation: 'Robot có 2 hình vuông: 1 hình vuông xanh lá ở cổ và 1 hình vuông cam ở thân.'
  },
  {
    id: 'vio-22',
    type: 'Tự luận',
    question: 'Số cần điền vào dấu hỏi chấm trên mình chú sâu là ...',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 110" width="350" height="100">
      <rect x="0" y="0" width="380" height="110" rx="14" fill="#d9f99d"/>
      <!-- Đầu sâu -->
      <circle cx="42" cy="54" r="24" fill="#c084fc" stroke="#6b21a8" stroke-width="2.5"/>
      <line x1="34" y1="30" x2="26" y2="14" stroke="#6b21a8" stroke-width="2.5"/>
      <circle cx="26" cy="14" r="4" fill="#6b21a8"/>
      <line x1="50" y1="30" x2="58" y2="14" stroke="#6b21a8" stroke-width="2.5"/>
      <circle cx="58" cy="14" r="4" fill="#6b21a8"/>
      ${['1', '', '3', '4', '', '6', '?'].map((lbl, idx) => {
        const cx = 86 + idx * 42;
        const isLast = lbl === '?';
        return `<circle cx="${cx}" cy="66" r="20" fill="#f8fafc" stroke="#7e22ce" stroke-width="3"/>
                <text x="${cx}" y="74" text-anchor="middle" font-size="${isLast ? '24' : '18'}" font-weight="900" fill="${isLast ? '#dc2626' : '#1e293b'}">${lbl}</text>`;
      }).join('')}
    </svg>`,
    options: [],
    answer: '7',
    explanation: 'Dãy số tự nhiên liên tiếp từ 1 đến 7: 1, 2, 3, 4, 5, 6, 7. Vậy dấu ? là số 7.'
  },
  {
    id: 'vio-23',
    type: 'Trắc nghiệm',
    question: 'Hình còn thiếu trong chiếc hộp có dấu (?) là hình gì?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 95" width="350" height="88">
      ${[6, 10, 14, 20, 0].map((r, idx) => {
        const x = 14 + idx * 72;
        return `<g transform="translate(${x}, 20)">
          ${r > 0 ? `<circle cx="28" cy="${32 - r / 2}" r="16" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5"/>` : `<text x="28" y="14" text-anchor="middle" font-size="26" font-weight="900" fill="#1e293b">?</text>`}
          <rect x="6" y="30" width="44" height="32" fill="#d6b38e" stroke="#78350f" stroke-width="2"/>
          <polygon points="6,30 0,40 16,40 22,30" fill="#e7cba9" stroke="#78350f" stroke-width="1.5"/>
          <polygon points="50,30 56,40 40,40 34,30" fill="#e7cba9" stroke="#78350f" stroke-width="1.5"/>
        </g>`;
      }).join('')}
    </svg>`,
    options: [
      { text: 'Hình tam giác', image: '' },
      { text: 'Hình tròn', image: '' },
      { text: 'Hình vuông', image: '' },
      { text: 'Hình chữ nhật', image: '' }
    ],
    answer: 'B',
    explanation: 'Hình màu xanh nhô dần lên từ trong hộp là một hình tròn.'
  },
  {
    id: 'vio-24',
    type: 'Tự luận',
    question: 'Số cần điền vào dấu hỏi chấm là ...',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 110" width="210" height="105">
      ${['1', '3', '5', '?'].map((lbl, idx) => {
        const x = 22 + idx * 50;
        return `<rect x="${x}" y="38" width="16" height="40" fill="#84cc16" rx="2"/>
                <text x="${x + 8}" y="100" text-anchor="middle" font-size="18" font-weight="900" fill="#1e293b">${lbl}</text>`;
      }).join('')}
      <path d="M32,34 Q55,16 76,34" fill="none" stroke="#dc2626" stroke-width="2.5"/>
      <text x="54" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e293b">+2</text>
      <path d="M82,34 Q105,16 126,34" fill="none" stroke="#dc2626" stroke-width="2.5"/>
      <text x="104" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e293b">+2</text>
      <path d="M132,34 Q155,16 176,34" fill="none" stroke="#dc2626" stroke-width="2.5"/>
      <text x="154" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e293b">+2</text>
    </svg>`,
    options: [],
    answer: '7',
    explanation: 'Quy luật cộng thêm 2: 1 + 2 = 3; 3 + 2 = 5; 5 + 2 = 7.'
  },
  {
    id: 'vio-25',
    type: 'Trắc nghiệm',
    question: 'Không thực hiện phép tính, hãy so sánh: 7 + 0 ⬜ 2 + 0',
    image: '',
    options: [
      { text: '<', image: '' },
      { text: '>', image: '' },
      { text: '=', image: '' }
    ],
    answer: 'B',
    explanation: 'Vì 7 > 2 nên 7 + 0 > 2 + 0.'
  },
  {
    id: 'vio-26',
    type: 'Trắc nghiệm',
    question: 'Hình tiếp theo ở dấu hỏi chấm (?) là hình gì?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 230" width="130" height="210">
      <text x="70" y="34" text-anchor="middle" font-size="34" font-weight="900" fill="#1e293b">?</text>
      <polygon points="70,42 42,74 98,74" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
      <rect x="34" y="76" width="72" height="22" fill="#0ea5e9" stroke="#1e293b" stroke-width="2"/>
      <polygon points="70,104 42,136 98,136" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
      <rect x="34" y="138" width="72" height="22" fill="#0ea5e9" stroke="#1e293b" stroke-width="2"/>
      <polygon points="70,166 42,198 98,198" fill="#facc15" stroke="#1e293b" stroke-width="2"/>
    </svg>`,
    options: [
      {
        text: 'Tam giác vàng',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="90" height="54"><polygon points="50,8 22,50 78,50" fill="#facc15" stroke="#1e293b" stroke-width="2"/></svg>`
      },
      {
        text: 'Hình chữ nhật xanh dương',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="90" height="54"><rect x="14" y="18" width="72" height="24" fill="#0ea5e9" stroke="#1e293b" stroke-width="2"/></svg>`
      },
      {
        text: 'Hình chữ nhật vàng',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="90" height="54"><rect x="14" y="18" width="72" height="24" fill="#facc15" stroke="#1e293b" stroke-width="2"/></svg>`
      },
      {
        text: 'Tam giác xanh dương',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="90" height="54"><polygon points="50,8 22,50 78,50" fill="#0ea5e9" stroke="#1e293b" stroke-width="2"/></svg>`
      }
    ],
    answer: 'B',
    explanation: 'Quy luật xen kẽ từ dưới lên: Tam giác vàng -> Hình chữ nhật xanh dương -> Tam giác vàng -> Hình chữ nhật xanh dương -> Tam giác vàng -> Tiếp theo là Hình chữ nhật xanh dương.'
  },
  {
    id: 'vio-27',
    type: 'Trắc nghiệm',
    question: 'Bạn Hùng vẽ robot nhưng bị thiếu mất 1 hình ở bàn tay. Em đoán xem Hùng vẽ thiếu hình gì?',
    image: makeRobotSvg(true),
    options: [
      { text: 'Hình tam giác', image: '' },
      { text: 'Hình tròn', image: '' },
      { text: 'Hình vuông', image: '' },
      { text: 'Hình chữ nhật', image: '' }
    ],
    answer: 'B',
    explanation: 'Bàn tay bên phải là một hình tròn màu vàng, còn tay bên trái bị thiếu mất 1 hình tròn.'
  },
  {
    id: 'vio-28',
    type: 'Trắc nghiệm',
    question: 'Bóng của hình quả sồi trên là hình nào?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" width="90" height="100">
      <path d="M48,18 Q54,6 64,10" fill="none" stroke="#78350f" stroke-width="5" stroke-linecap="round"/>
      <path d="M24,42 Q50,18 76,42 Z" fill="#92400e"/>
      <path d="M28,42 L72,42 Q74,84 50,96 Q26,84 28,42 Z" fill="#d97706"/>
    </svg>`,
    options: [
      {
        text: 'Bóng cái cây',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="80" height="80"><circle cx="50" cy="36" r="20" fill="#475569"/><circle cx="38" cy="48" r="14" fill="#475569"/><circle cx="62" cy="48" r="14" fill="#475569"/><rect x="46" y="56" width="8" height="30" fill="#475569"/></svg>`
      },
      {
        text: 'Bóng quả sồi',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="80" height="80"><path d="M48,16 Q54,6 62,10" fill="none" stroke="#475569" stroke-width="5" stroke-linecap="round"/><path d="M24,40 Q50,18 76,40 Z" fill="#475569"/><path d="M28,40 L72,40 Q74,80 50,92 Q26,80 28,40 Z" fill="#475569"/></svg>`
      },
      {
        text: 'Bóng tách trà',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="80" height="80"><path d="M24,38 L70,38 Q68,72 47,72 Q26,72 24,38 Z" fill="#475569"/><path d="M70,44 Q84,44 84,54 Q84,64 68,64" fill="none" stroke="#475569" stroke-width="6"/><rect x="16" y="74" width="64" height="7" rx="3" fill="#475569"/></svg>`
      },
      {
        text: 'Bóng đôi tất',
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="80" height="80"><path d="M36,22 L48,22 L48,58 L32,74 L24,66 L36,54 Z" fill="#475569"/><path d="M58,28 L70,28 L70,64 L54,80 L46,72 L58,60 Z" fill="#475569"/></svg>`
      }
    ],
    answer: 'B',
    explanation: 'Hình B có đường viền trùng khớp hoàn toàn với bóng của quả sồi.'
  },
  {
    id: 'vio-29',
    type: 'Trắc nghiệm',
    question: 'Để gấp được bông hoa trên cần những màu nào dưới đây?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="110" height="125">
      <!-- Bông hoa giấy tím đậm + tím nhạt -->
      <polygon points="36,22 60,46 36,64" fill="#a78bfa"/>
      <polygon points="84,22 60,46 84,64" fill="#a78bfa"/>
      <polygon points="60,18 46,42 74,42" fill="#5b21b6"/>
      <polygon points="36,64 84,64 60,84" fill="#8b5cf6"/>
      <!-- Cuống và lá xanh -->
      <rect x="57" y="82" width="6" height="44" fill="#84cc16"/>
      <polygon points="57,108 26,88 42,118" fill="#84cc16"/>
      <polygon points="63,108 94,88 78,118" fill="#84cc16"/>
    </svg>`,
    options: [
      { text: 'Hồng và xanh lá', image: makeColorStripsSvg(['#ec4899', '#84cc16', '#f472b6', '#be185d']) },
      { text: 'Cam, vàng và xanh lá', image: makeColorStripsSvg(['#c2410c', '#84cc16', '#facc15', '#d97706']) },
      { text: 'Đỏ và xanh lá', image: makeColorStripsSvg(['#d97706', '#b91c1c', '#84cc16', '#dc2626']) },
      { text: 'Tím đậm, tím nhạt và xanh lá', image: makeColorStripsSvg(['#5b21b6', '#a78bfa', '#84cc16', '#8b5cf6']) }
    ],
    answer: 'D',
    explanation: 'Bông hoa được ghép từ các mảnh giấy màu tím đậm, tím nhạt và lá màu xanh lá cây (Đáp án D).'
  },
  {
    id: 'vio-30',
    type: 'Trắc nghiệm',
    question: 'Hình trên có mấy con cá?',
    image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 200" width="200" height="180">
      <rect x="6" y="6" width="208" height="188" fill="#fff" stroke="#475569" stroke-width="3"/>
      ${[
        [35, 38], [120, 34],
        [62, 68], [146, 66],
        [35, 112], [120, 108],
        [62, 146], [146, 144]
      ].map(([x, y]) => `
        <g transform="translate(${x}, ${y}) rotate(-18)">
          <ellipse cx="18" cy="12" rx="18" ry="9" fill="#c084fc" stroke="#7e22ce" stroke-width="1.5"/>
          <polygon points="34,12 46,3 46,21" fill="#a855f7"/>
          <circle cx="8" cy="10" r="2" fill="#1e293b"/>
        </g>
      `).join('')}
    </svg>`,
    options: [
      { text: '6', image: '' },
      { text: '8', image: '' },
      { text: '5', image: '' },
      { text: '7', image: '' }
    ],
    answer: 'B',
    explanation: 'Đếm lần lượt từng hàng có tất cả 8 con cá màu tím.'
  }
];
