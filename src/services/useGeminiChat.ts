// ===== REACT HOOK FOR GEMINI CHAT WITH RETRY & ERROR HANDLING =====

import { useState, useCallback, useRef, useEffect } from 'react';
import { callGeminiAPI } from '../services/apiClient';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface UseGeminiChatReturn {
    messages: ChatMessage[];
    isLoading: boolean;
    isRetrying: boolean;
    error: string | null;
    retryCount: number;
    maxRetries: number;
    sendMessage: (content: string) => Promise<void>;
    resetChat: () => void;
    clearError: () => void;
}

export function useGeminiChat(apiKey: string): UseGeminiChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const maxRetries = 5;

    const abortControllerRef = useRef<AbortController | null>(null);

    // Lắng nghe sự kiện rate limit từ apiClient để cập nhật UI
    useEffect(() => {
        const handleRateLimit = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                setIsRetrying(true);
                setRetryCount(customEvent.detail.attemptNumber);
            }
        };

        window.addEventListener('apiRateLimit', handleRateLimit);
        return () => {
            window.removeEventListener('apiRateLimit', handleRateLimit);
        };
    }, []);

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        setIsLoading(true);
        setIsRetrying(false);
        setError(null);
        setRetryCount(0);

        const userMessage: ChatMessage = { role: 'user', content };

        // Cập nhật UI ngay lập tức (Optimistic update)
        setMessages(prev => [...prev, userMessage]);

        try {
            // Chuyển đổi lịch sử chat sang định dạng Gemini API
            const apiContents = [...messages, userMessage].map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            const response = await callGeminiAPI(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    data: {
                        contents: apiContents,
                    },
                },
                {
                    maxRetries,
                    initialDelay: 1000,
                    maxDelay: 30000,
                }
            );

            const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || 'Không có phản hồi';

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: responseText,
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err: any) {
            const errorMessage = err.message || 'Gửi tin nhắn thất bại';
            setError(errorMessage);
            console.error('Chat error:', err);
        } finally {
            setIsLoading(false);
            setIsRetrying(false);
        }
    }, [messages, apiKey]);

    const resetChat = useCallback(() => {
        setMessages([]);
        setError(null);
        setRetryCount(0);
        setIsRetrying(false);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        messages,
        isLoading,
        isRetrying,
        error,
        retryCount,
        maxRetries,
        sendMessage,
        resetChat,
        clearError,
    };
}

export default useGeminiChat;