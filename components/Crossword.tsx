import React, { useState, useEffect, useRef } from 'react';

interface Word {
    word: string;
    clue: string;
    direction: 'across' | 'down';
    row: number;
    col: number;
}

interface CrosswordData {
    size: number;
    words: Word[];
}

interface CrosswordProps {
    data: CrosswordData;
}

const Crossword: React.FC<CrosswordProps> = ({ data }) => {
    const { size, words } = data;
    const [grid, setGrid] = useState<string[][]>(() => Array(size).fill(null).map(() => Array(size).fill('')));
    const [solution, setSolution] = useState<string[][]>(() => Array(size).fill(null).map(() => Array(size).fill('')));
    const [isCorrect, setIsCorrect] = useState<boolean[][]>(() => Array(size).fill(null).map(() => Array(size).fill(false)));
    const [isChecking, setIsChecking] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

    useEffect(() => {
        const newSolution = Array(size).fill(null).map(() => Array(size).fill(''));
        words.forEach(word => {
            for (let i = 0; i < word.word.length; i++) {
                if (word.direction === 'across') {
                    newSolution[word.row][word.col + i] = word.word[i].toUpperCase();
                } else {
                    newSolution[word.row + i][word.col] = word.word[i].toUpperCase();
                }
            }
        });
        setSolution(newSolution);
        // Reset grid when data changes
        setGrid(Array(size).fill(null).map(() => Array(size).fill('')));
        setIsCorrect(Array(size).fill(null).map(() => Array(size).fill(false)));
        setIsChecking(false);
    }, [data, size, words]);

    const handleInputChange = (row: number, col: number, value: string) => {
        const newGrid = grid.map(r => [...r]);
        newGrid[row][col] = value.toUpperCase().slice(0, 1);
        setGrid(newGrid);

        if (value) {
            if (col + 1 < size && solution[row][col + 1]) {
                inputRefs.current[row]?.[col + 1]?.focus();
            } else if (row + 1 < size && solution[row + 1]?.[col]) {
                inputRefs.current[row + 1]?.[col]?.focus();
            }
        }
    };

    const checkAnswers = () => {
        setIsChecking(true);
        const newIsCorrect = Array(size).fill(null).map(() => Array(size).fill(false));
        let allCorrect = true;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (solution[r][c]) {
                    if (grid[r][c] === solution[r][c]) {
                        newIsCorrect[r][c] = true;
                    } else {
                        allCorrect = false;
                    }
                }
            }
        }
        setIsCorrect(newIsCorrect);
        if (allCorrect) {
            alert('Chúc mừng! Bạn đã hoàn thành ô chữ một cách xuất sắc!');
        }
    };

    const handleHint = (word: Word) => {
        if (!window.confirm("Bạn muốn xem đáp án cho từ này?")) return;
        const newGrid = grid.map(r => [...r]);
        for (let i = 0; i < word.word.length; i++) {
            if (word.direction === 'across') {
                newGrid[word.row][word.col + i] = word.word[i].toUpperCase();
            } else {
                newGrid[word.row + i][word.col] = word.word[i].toUpperCase();
            }
        }
        setGrid(newGrid);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="flex-shrink-0">
                <div className="grid gap-0.5 bg-slate-300 p-1 rounded-lg shadow-inner" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
                    {grid.map((row, r) =>
                        row.map((cell, c) => {
                            const isCellActive = solution[r][c] !== '';
                            if (!isCellActive) {
                                return <div key={`${r}-${c}`} className="w-8 h-8 bg-slate-200"></div>;
                            }
                            return (
                                <input
                                    key={`${r}-${c}`}
                                    ref={el => {
                                        if (!inputRefs.current[r]) inputRefs.current[r] = [];
                                        inputRefs.current[r][c] = el;
                                    }}
                                    type="text"
                                    maxLength={1}
                                    value={cell}
                                    onChange={(e) => handleInputChange(r, c, e.target.value)}
                                    className={`w-8 h-8 text-center font-black text-sm uppercase border rounded-sm outline-none transition-all ${isChecking ? (isCorrect[r][c] ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-rose-100 border-rose-300 text-rose-700') : 'bg-white border-slate-200 text-slate-800 focus:bg-indigo-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300'}`}
                                />
                            );
                        })
                    )}
                </div>
                <button onClick={checkAnswers} className="mt-4 w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700">Kiểm tra đáp án</button>
            </div>
            <div className="flex-1 space-y-6 text-xs">
                <div>
                    <h4 className="font-black text-slate-800 uppercase tracking-widest border-b-2 border-indigo-200 pb-2 mb-3">Hàng ngang</h4>
                    <div className="space-y-2">
                        {words.filter(w => w.direction === 'across').map((w, i) => (
                            <div key={i} className="flex items-start justify-between group hover:bg-slate-50 p-1 rounded transition-colors">
                                <p className="flex-1"><b>({w.col + 1},{w.row + 1}):</b> {w.clue}</p>
                                <button
                                    onClick={() => handleHint(w)}
                                    className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all hover:bg-amber-200 whitespace-nowrap"
                                >
                                    Gợi ý
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h4 className="font-black text-slate-800 uppercase tracking-widest border-b-2 border-indigo-200 pb-2 mb-3">Hàng dọc</h4>
                    <div className="space-y-2">
                        {words.filter(w => w.direction === 'down').map((w, i) => (
                            <div key={i} className="flex items-start justify-between group hover:bg-slate-50 p-1 rounded transition-colors">
                                <p className="flex-1"><b>({w.col + 1},{w.row + 1}):</b> {w.clue}</p>
                                <button
                                    onClick={() => handleHint(w)}
                                    className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all hover:bg-amber-200 whitespace-nowrap"
                                >
                                    Gợi ý
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Crossword;