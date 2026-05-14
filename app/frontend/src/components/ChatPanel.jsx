import { useState, useRef, useEffect } from 'react'

const SUGGESTED = [
  'What does the suitability score mean?',
  'Why is my land showing low confidence?',
  'Explain the senescence rate feature',
  'Is this land good for vineyard?',
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {/* Avatar */}
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
        isUser ? 'bg-field text-white' : 'bg-amber-100 text-amber-700'
      }`}>
        {isUser ? 'Y' : '🌾'}
      </div>
      <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
        isUser
          ? 'bg-field text-white rounded-br-sm'
          : 'bg-stone-100 text-stone-700 rounded-bl-sm'
      }`}>
        {msg.content}
      </div>
    </div>
  )
}

export default function ChatPanel({ isOpen, onToggle, selectedParcel, region }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi — I\'m your AgriOpenEye assistant. Ask me anything about your land, the crop scores, or how the tool works.',
    },
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef             = useRef(null)
  const inputRef              = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Notify when a parcel is selected (only once per parcel)
  const lastParcelRef = useRef(null)
  useEffect(() => {
    if (selectedParcel && selectedParcel.parcel_id !== lastParcelRef.current) {
      lastParcelRef.current = selectedParcel.parcel_id
      const crop = selectedParcel.best_crop || 'uncertain'
      const score = selectedParcel.best_score?.toFixed(1) ?? '?'
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Parcel #${selectedParcel.parcel_id} loaded — best match: ${crop} (${score}%). Ask me anything about it.`,
        },
      ])
    }
  }, [selectedParcel])

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { role: 'user', content: msg }
    const next = [...messages, userMsg]
    setMessages(next)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: next.slice(-7, -1).map(m => ({ role: m.role, content: m.content })),
          parcel_id: selectedParcel?.parcel_id ?? null,
          region: region ?? null,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'No response.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Try again.' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={onToggle}
        className={`absolute bottom-5 left-5 z-[1000] flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg text-xs font-semibold transition-all ${
          isOpen
            ? 'bg-field text-white'
            : 'bg-white text-stone-700 border border-stone-200 hover:border-field hover:text-field'
        }`}
      >
        <span className="text-sm">💬</span>
        {isOpen ? 'Close chat' : 'Ask assistant'}
      </button>

      {/* Panel */}
      <div className={`
        absolute bottom-20 left-5 z-[999]
        w-80 bg-white rounded-2xl shadow-2xl border border-stone-100
        flex flex-col overflow-hidden
        transition-all duration-300
        ${isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}
        style={{ maxHeight: 'calc(100vh - 160px)', minHeight: 360 }}
      >
        {/* Header */}
        <div className="bg-field px-4 py-3 flex items-center gap-2 flex-shrink-0">
          <span className="text-lg">🌾</span>
          <div>
            <div className="text-white text-xs font-semibold">AgriOpenEye Assistant</div>
            {selectedParcel ? (
              <div className="text-white/60 text-[10px]">Parcel #{selectedParcel.parcel_id} · {region}</div>
            ) : (
              <div className="text-white/60 text-[10px]">Select a parcel for land-specific answers</div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map((m, i) => <Message key={i} msg={m} />)}
          {loading && (
            <div className="flex gap-2 items-end">
              <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex-shrink-0 flex items-center justify-center text-[10px]">🌾</div>
              <div className="bg-stone-100 rounded-2xl rounded-bl-sm px-3 py-2">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggested questions — only show when few messages */}
        {messages.length <= 2 && !loading && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {SUGGESTED.map(q => (
              <button
                key={q}
                onClick={() => send(q)}
                className="text-[10px] bg-stone-50 hover:bg-amber-50 hover:text-amber-700 border border-stone-100 hover:border-amber-200 text-stone-500 rounded-full px-2.5 py-1 transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 flex-shrink-0 border-t border-stone-50 pt-2">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              placeholder="Ask about your land…"
              rows={1}
              className="flex-1 resize-none bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-[12px] text-stone-700 placeholder-stone-400 focus:outline-none focus:border-field focus:bg-white transition-colors"
              style={{ maxHeight: 80 }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl bg-field text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
