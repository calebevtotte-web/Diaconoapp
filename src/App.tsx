/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Calendar as CalendarIcon, LayoutDashboard, FileText, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, Plus, Search, Trash2, Star, Share2, Copy, 
  Check, AlertTriangle, Info, ArrowRightLeft, RefreshCw, UserPlus, Phone, MoreHorizontal, X,
  Sparkles, MessageCircle, Heart, BarChart3, PieChart as PieChartIcon, TrendingUp
} from 'lucide-react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, 
  getDay, isToday, isSameMonth, parse, startOfWeek, endOfWeek, isAfter, subDays, startOfDay, endOfDay,
  differenceInDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { cn, DAYS_SHORT, DB_KEY } from './lib/utils';
import { AppDB, Member, Scale, Settings, ServiceType, SERVICE_LABELS } from './types';

// --- Helpers ---
const isMemberAvailable = (member: Member, dateStr: string) => {
  const dow = getDay(parse(dateStr, 'yyyy-MM-dd', new Date()));
  const isDayOk = member.availableDays.length === 0 || member.availableDays.includes(dow);
  const isDateOk = !member.unavailableDates?.includes(dateStr);
  return isDayOk && isDateOk;
};

// --- AI Service ---
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

async function getAISmartSuggestion(db: AppDB, date: string, serviceType: ServiceType, qty: number) {
  if (!ai) throw new Error('GEMINI_API_KEY não configurado');
  
  const availableMembers = db.members.filter(m => isMemberAvailable(m, date));
  
  const context = {
    date,
    serviceType: SERVICE_LABELS[serviceType],
    qtyNeeded: qty,
    members: availableMembers.map(m => ({
      id: m.id,
      name: m.name,
      priority: m.flagged,
      totalParticipations: db.scales.filter(s => s.members.includes(m.id)).length,
      lastServed: db.scales.filter(s => s.members.includes(m.id)).sort((a,b) => b.date.localeCompare(a.date))[0]?.date || 'Nunca'
    }))
  };

  const prompt = `Você é um assistente de gestão ministerial. Sua tarefa é sugerir ${qty} pessoas de uma lista de voluntários para servir no evento "${SERVICE_LABELS[serviceType]}" no dia ${date}. Retorne APENAS um array JSON contendo os IDs das ${qty} pessoas sugeridas. Exemplo: ["id1", "id2"]. Dados: ${JSON.stringify(context)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    const text = response.text || "[]";
    const cleanText = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanText) as string[];
  } catch (error) {
    console.error('AI Suggestion Error:', error);
    throw error;
  }
}

// --- Default Data ---
const DEFAULT_DB: AppDB = {
  members: [],
  scales: [],
  settings: {
    church: '',
    ministry: 'Ministério de Diaconia',
    leader: ''
  }
};

export default function App() {
  const [db, setDb] = useState<AppDB>(() => {
    const saved = localStorage.getItem(DB_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_DB;
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [memberSearch, setMemberSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState({
    type: 'all' as 'all' | 'member' | 'scale',
    startDate: '',
    endDate: '',
    onlyPriority: false
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [isFullMonthModalOpen, setIsFullMonthModalOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'warn' } | null>(null);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }, [db]);

  const showToast = (msg: string, type: 'success' | 'error' | 'warn' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Full Month Generator Logic ---
  const generateFullMonthScales = (selectedDows: number[], dowConfigs: Record<number, { name: string, qty: number }>) => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const monthPrefix = format(currentMonth, 'yyyy-MM');

    // Remove existing scales for this month
    const otherScales = db.scales.filter(s => !s.date.startsWith(monthPrefix));
    let newScales: Scale[] = [];
    const pickCount: Record<string, number> = {};
    db.members.forEach(m => pickCount[m.id] = 0);

    days.forEach(day => {
      const dow = getDay(day);
      if (!selectedDows.includes(dow)) return;

      const dateStr = format(day, 'yyyy-MM-dd');
      const cfg = dowConfigs[dow];
      const available = db.members.filter(m => isMemberAvailable(m, dateStr));
      
      const scored = [...available].sort((a, b) => {
        const sa = (a.flagged ? -1000 : 0) + getScaleCount(a.id) + (pickCount[a.id] || 0) * 2;
        const sb = (b.flagged ? -1000 : 0) + getScaleCount(b.id) + (pickCount[b.id] || 0) * 2;
        return sa - sb;
      });

      const picked = scored.slice(0, Math.min(cfg.qty, scored.length));
      picked.forEach(m => pickCount[m.id]++);

      newScales.push({
        id: Math.random().toString(36).substr(2, 9),
        event: cfg.name,
        date: dateStr,
        members: picked.map(m => m.id),
        swaps: [],
        createdAt: Date.now()
      });
    });

    setDb(prev => ({
      ...prev,
      scales: [...otherScales, ...newScales],
      members: prev.members.map(m => {
        const isPickedInAny = newScales.some(s => s.members.includes(m.id));
        return isPickedInAny ? { ...m, flagged: false } : m;
      })
    }));

    showToast(`✅ ${newScales.length} escalas geradas com sucesso!`);
    setIsFullMonthModalOpen(false);
  };

  const undoSwap = (scaleId: string, swapIndex: number) => {
    setDb(prev => {
      const scale = prev.scales.find(s => s.id === scaleId);
      if (!scale) return prev;
      
      const swaps = scale.swaps || [];
      const swap = swaps[swapIndex];
      if (!swap) return prev;

      const newMembers = scale.members.map(id => id === swap.toId ? swap.fromId : id);
      const newSwaps = swaps.filter((_, i) => i !== swapIndex);

      return {
        ...prev,
        scales: prev.scales.map(s => s.id === scaleId ? { ...s, members: newMembers, swaps: newSwaps } : s),
        members: prev.members.map(m => m.id === swap.fromId ? { ...m, flagged: false } : m)
      };
    });
    showToast('Troca revertida com sucesso');
  };

  // --- Members Logic ---
  const saveMember = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const phone = formData.get('phone') as string;
    const availableDays = Array.from(formData.getAll('days')).map(Number);
    const unavailableDates = editingMember?.unavailableDates || [];

    if (!name.trim()) return showToast('Nome é obrigatório', 'error');

    if (editingMember) {
      setDb(prev => ({
        ...prev,
        members: prev.members.map(m => m.id === editingMember.id ? {
          ...m, name, phone, availableDays, unavailableDates
        } : m)
      }));
      showToast('Membro atualizado');
    } else {
      const newMember: Member = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        phone,
        flagged: false,
        availableDays,
        unavailableDates,
        addedAt: Date.now()
      };
      setDb(prev => ({ ...prev, members: [...prev.members, newMember] }));
      showToast('Membro adicionado');
    }
    setIsMemberModalOpen(false);
    setEditingMember(null);
  };

  const deleteMember = (id: string) => {
    setDb(prev => ({ 
      ...prev, 
      members: prev.members.filter(m => m.id !== id),
      scales: prev.scales.map(s => ({ ...s, members: s.members.filter(mId => mId !== id) }))
    }));
    showToast('Membro removido');
  };

  const toggleFlag = (id: string) => {
    setDb(prev => ({
      ...prev,
      members: prev.members.map(m => m.id === id ? { ...m, flagged: !m.flagged } : m)
    }));
  };

  // --- Scale Logic ---
  const getScaleCount = (memberId: string) => db.scales.filter(s => s.members.includes(memberId)).length;
  const getLastScaleDate = (memberId: string) => {
    const memberScales = db.scales.filter(s => s.members.includes(memberId));
    if (memberScales.length === 0) return null;
    return memberScales.sort((a, b) => b.date.localeCompare(a.date))[0].date;
  };

  const currentScale = useMemo(() => {
    return db.scales.find(s => s.date === selectedDate) || null;
  }, [db.scales, selectedDate]);

  const saveScale = (memberIds: string[], eventName: string, serviceType?: ServiceType) => {
    if (!selectedDate) return;

    // Last line of defense: final validation
    const invalidMember = memberIds.find(id => {
      const m = db.members.find(x => x.id === id);
      return m && !isMemberAvailable(m, selectedDate);
    });

    if (invalidMember) {
      const m = db.members.find(x => x.id === invalidMember);
      return showToast(`Impossível salvar: ${m?.name} possui impedimento nesta data.`, 'error');
    }
    
    if (currentScale) {
      setDb(prev => ({
        ...prev,
        scales: prev.scales.map(s => s.date === selectedDate ? {
          ...s, members: memberIds, event: eventName, serviceType, updatedAt: Date.now()
        } : s)
      }));
    } else {
      const newScale: Scale = {
        id: Math.random().toString(36).substr(2, 9),
        event: eventName,
        date: selectedDate,
        members: memberIds,
        serviceType,
        swaps: [],
        createdAt: Date.now()
      };
      setDb(prev => ({
        ...prev,
        scales: [...prev.scales, newScale],
        members: prev.members.map(m => memberIds.includes(m.id) ? { ...m, flagged: false } : m)
      }));
    }
    showToast('Escala salva com sucesso');
    setIsDayModalOpen(false);
  };

  const deleteScale = (date: string) => {
    setDb(prev => ({ ...prev, scales: prev.scales.filter(s => s.date !== date) }));
    showToast('Escala removida');
    setIsDayModalOpen(false);
  };

  const suggestMembers = (dateStr: string, qty: number, randomize = false) => {
    const available = db.members.filter(m => isMemberAvailable(m, dateStr));

    if (available.length === 0) return [];

    let pool = [...available];
    if (randomize) {
      pool = pool.sort(() => Math.random() - 0.5);
    }

    return pool
      .sort((a, b) => {
        if (a.flagged && !b.flagged) return -1;
        if (!a.flagged && b.flagged) return 1;
        return getScaleCount(a.id) - getScaleCount(b.id);
      })
      .slice(0, qty);
  };

  const handleSwap = (fromId: string, toId: string) => {
    if (!selectedDate || !currentScale) return;
    setDb(prev => ({
      ...prev,
      scales: prev.scales.map(s => s.date === selectedDate ? {
        ...s,
        members: s.members.map(id => id === fromId ? toId : id),
        swaps: [...(s.swaps || []), { fromId, toId, at: Date.now() }]
      } : s),
      members: prev.members.map(m => 
        m.id === fromId ? { ...m, flagged: true } : 
        m.id === toId ? { ...m, flagged: false } : m
      )
    }));
    showToast('Troca realizada');
  };

  const stats = useMemo(() => ({
    totalMembers: db.members.length,
    totalScales: db.scales.length,
    priorityCount: db.members.filter(m => m.flagged).length
  }), [db]);

  const searchResults = useMemo(() => {
    if (!searchQuery && !searchFilters.startDate && !searchFilters.endDate && !searchFilters.onlyPriority) return { members: [], scales: [] };

    const query = searchQuery.toLowerCase();
    
    const filteredMembers = db.members.filter(m => {
      if (searchFilters.type === 'scale') return false;
      const matchesQuery = m.name.toLowerCase().includes(query) || (m.phone && m.phone.includes(query));
      const matchesPriority = searchFilters.onlyPriority ? m.flagged : true;
      return matchesQuery && matchesPriority;
    });

    const filteredScales = db.scales.filter(s => {
      if (searchFilters.type === 'member') return false;
      const matchesQuery = s.event.toLowerCase().includes(query);
      const matchesDate = (!searchFilters.startDate || s.date >= searchFilters.startDate) && 
                         (!searchFilters.endDate || s.date <= searchFilters.endDate);
      return matchesQuery && matchesDate;
    });

    return { members: filteredMembers, scales: filteredScales };
  }, [db, searchQuery, searchFilters]);

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#1e293b] font-sans">
      {/* Mobile Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-[100] px-2 pt-3 pb-8 flex items-center justify-around shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
        <MobileNavBtn active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Início" />
        <MobileNavBtn active={activeTab === 'health'} onClick={() => setActiveTab('health')} icon={<Heart size={20} />} label="Saúde" />
        <MobileNavBtn active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<CalendarIcon size={20} />} label="Escalas" />
        <MobileNavBtn active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={20} />} label="Equipe" />
        <MobileNavBtn active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<Share2 size={20} />} label="Manual" />
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen w-72 bg-[#0F172A] text-white z-50 flex-col shadow-xl">
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/20">⛪</div>
            <div>
              <h1 className="text-lg font-black leading-tight tracking-tight">{db.settings.ministry || 'Diaconia'}</h1>
              <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">Gestão Pastoral</span>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-6 flex flex-col gap-2">
          <SidebarNavBtn active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Painel Geral" />
          <SidebarNavBtn active={activeTab === 'health'} onClick={() => setActiveTab('health')} icon={<Heart size={20} />} label="Saúde do Ministério" />
          <SidebarNavBtn active={activeTab === 'search'} onClick={() => setActiveTab('search')} icon={<Search size={20} />} label="Busca Global" />
          <SidebarNavBtn active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={20} />} label="Corpo de Membros" />
          <SidebarNavBtn active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<CalendarIcon size={20} />} label="Calendário Mensal" />
          <SidebarNavBtn active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText size={20} />} label="Relatórios WhatsApp" />
          <div className="mt-auto pt-6 border-t border-white/5">
            <SidebarNavBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={20} />} label="Configurações" />
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-0 md:ml-72 p-4 md:p-10 pb-32 md:pb-10 transition-all">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-5xl mx-auto space-y-10">
              <div className="flex justify-between items-center">
                <Header title="Olá! 👋" subtitle="Aqui está o resumo do seu ministério hoje." />
                <button onClick={() => setActiveTab('search')} className="hidden sm:flex w-12 h-12 rounded-full bg-white border border-slate-200 items-center justify-center text-slate-400 hover:text-emerald-500 hover:border-emerald-200 transition-all shadow-sm">
                  <Search size={20} />
                </button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                <DashboardStat icon={<Users />} label="Voluntários" value={stats.totalMembers} trend="Total" />
                <DashboardStat icon={<CalendarIcon />} label="Escalas" value={stats.totalScales} trend="No mês" />
                <DashboardStat icon={<Star />} label="Prioridades" value={stats.priorityCount} trend="Aguardando" color="amber" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3 space-y-8">
                  <section>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Próxima Escala Confirmada
                    </h3>
                    <NextScaleInfo db={db} onNavigate={() => setActiveTab('calendar')} />
                  </section>

                  <section>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                      <LayoutDashboard size={14} className="text-emerald-500" />
                      Ranking de Engajamento
                    </h3>
                    <EngagementDashboard db={db} />
                  </section>
                </div>
                <div className="lg:col-span-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Membros Sugeridos</h3>
                  <div className="space-y-4">
                     {db.members.filter(m => m.flagged).slice(0, 4).map(m => (
                       <CompactMemberCard key={m.id} member={m} />
                     ))}
                     {stats.priorityCount === 0 && <div className="p-8 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 text-slate-400 text-xs font-bold">Sem pendências de prioridade</div>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'health' && (
            <motion.div key="health" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-6xl mx-auto">
              <Header title="Saúde do Ministério" subtitle="Analise o engajamento, detecte sobrecargas e cuide do seu time." />
              <MinistryHealthDashboard db={db} />
            </motion.div>
          )}

          {activeTab === 'search' && (
            <motion.div key="search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-6xl mx-auto">
              <Header title="Busca Inteligente" subtitle="Localize qualquer membro ou atividade registrada na base." />
              
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm mb-10">
                <div className="lg:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Palavras-chave</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Nome, telefone, evento..."
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-emerald-500 transition-all outline-none font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Filtrar por Tipo</label>
                  <select 
                    value={searchFilters.type}
                    onChange={e => setSearchFilters(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-emerald-500 transition-all outline-none font-bold appearance-none"
                  >
                    <option value="all">Tudo</option>
                    <option value="member">Pessoas</option>
                    <option value="scale">Escalas</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Visibilidade</label>
                  <button 
                    onClick={() => setSearchFilters(prev => ({ ...prev, onlyPriority: !prev.onlyPriority }))}
                    className={cn(
                      "w-full px-5 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 transition-all",
                      searchFilters.onlyPriority ? "bg-amber-50 border-amber-500 text-amber-700" : "bg-gray-50 border-transparent text-gray-400"
                    )}
                  >
                    <Star size={16} fill={searchFilters.onlyPriority ? "currentColor" : "none"} /> Prioritários
                  </button>
                </div>
                
                <div className="lg:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">De (Início)</label>
                  <input type="date" value={searchFilters.startDate} onChange={e => setSearchFilters(p => ({...p, startDate: e.target.value}))} className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-emerald-500 transition-all outline-none font-bold" />
                </div>
                <div className="lg:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Até (Fim)</label>
                  <input type="date" value={searchFilters.endDate} onChange={e => setSearchFilters(p => ({...p, endDate: e.target.value}))} className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-emerald-500 transition-all outline-none font-bold" />
                </div>
              </div>

              <div className="space-y-10">
                {(searchResults.members.length > 0 || searchResults.scales.length > 0) ? (
                  <>
                    {searchResults.members.length > 0 && (
                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Users className="text-emerald-600" size={20} />
                          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">Membros Encontrados ({searchResults.members.length})</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {searchResults.members.map(m => (
                            <MemberListItem 
                              key={m.id} 
                              member={m} 
                              onEdit={() => { setEditingMember(m); setIsMemberModalOpen(true); }}
                              onToggleFlag={() => toggleFlag(m.id)}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {searchResults.scales.length > 0 && (
                      <section className="space-y-4">
                        <div className="flex items-center gap-3">
                          <CalendarIcon className="text-blue-600" size={20} />
                          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">Escalas Encontradas ({searchResults.scales.length})</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {searchResults.scales.map(s => (
                            <div key={s.id} onClick={() => { setSelectedDate(s.date); setIsDayModalOpen(true); }} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{s.event}</p>
                                  <h4 className="text-lg font-black">{format(parse(s.date, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", { locale: ptBR })}</h4>
                                </div>
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 transition-colors group-hover:bg-blue-600 group-hover:text-white"><ArrowRightLeft size={18} /></div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {s.members.map(mId => {
                                  const m = db.members.find(x => x.id === mId);
                                  return m ? <span key={mId} className="px-3 py-1 bg-gray-50 rounded-lg text-[10px] font-bold text-gray-600">{m.name}</span> : null;
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                ) : (
                  <EmptyState 
                    icon={searchQuery || searchFilters.startDate ? <Search /> : <Search className="opacity-10" />} 
                    text={searchQuery || searchFilters.startDate ? "Sem resultados" : "Comece sua pesquisa"} 
                    subtitle="Digite o nome de um membro, evento ou selecione um intervalo de datas para buscar." 
                  />
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'members' && (
            <motion.div key="members" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-6xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                <Header title="Gerenciar Equipe" subtitle="Controle sua lista de voluntários e disponibilidades." />
                <button 
                  onClick={() => { setEditingMember(null); setIsMemberModalOpen(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700 transition text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95"
                >
                  <UserPlus size={18} /> Novo Integrante
                </button>
              </div>

              <Card className="p-4">
                <div className="flex flex-col gap-5">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Pesquisar por nome ou disponibilidade..."
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {db.members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase())).length > 0 ? db.members
                      .filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                      .sort((a,b) => a.name.localeCompare(b.name)).map(m => (
                      <MemberListItem 
                        key={m.id} 
                        member={m} 
                        lastScale={getLastScaleDate(m.id)}
                        totalScales={getScaleCount(m.id)}
                        onEdit={() => { setEditingMember(m); setIsMemberModalOpen(true); }}
                        onToggleFlag={() => toggleFlag(m.id)}
                        onDelete={() => deleteMember(m.id)}
                      />
                    )) : <div className="md:col-span-2"><EmptyState icon={<Users />} text="Equipe Vazia" subtitle="Clique no botão acima para adicionar seu primeiro voluntário." /></div>}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'calendar' && (
             <motion.div key="calendar" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-6xl mx-auto">
                <Header title="Escala do Mês" subtitle="Defina o planejamento ministerial clicando nos dias." />
                
                <Card className="p-0 border-0 shadow-xl rounded-3xl overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between bg-white gap-4">
                    <div className="flex items-center gap-6">
                      <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-3 hover:bg-gray-100 rounded-2xl transition ring-1 ring-gray-100"><ChevronLeft size={24} /></button>
                      <h2 className="text-2xl font-black capitalize min-w-[200px] text-center">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</h2>
                      <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-3 hover:bg-gray-100 rounded-2xl transition ring-1 ring-gray-100"><ChevronRight size={24} /></button>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setCurrentMonth(new Date())} className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition ring-1 ring-gray-100 outline-none">Hoje</button>
                      <button 
                        onClick={() => setIsFullMonthModalOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 transition text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/10 active:scale-95"
                      >
                         <RefreshCw size={14} /> Sortear Mês Todo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 bg-gray-50/30">
                    {DAYS_SHORT.map((day, i) => (
                      <div key={day} className={cn("py-4 text-center text-[10px] font-black uppercase tracking-[0.2em]", i === 0 ? "text-red-500" : "text-gray-400")}>
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 bg-white">
                    {getDaysInMonth(currentMonth).map((day) => {
                      const dateKey = format(day, 'yyyy-MM-dd');
                      return (
                        <CalendarDay 
                          key={dateKey}
                          day={day}
                          isCurrentMonth={isSameMonth(day, currentMonth)}
                          scale={db.scales.find(s => s.date === dateKey)}
                          members={db.members}
                          onClick={() => { setSelectedDate(dateKey); setIsDayModalOpen(true); }}
                        />
                      );
                    })}
                  </div>
                </Card>
             </motion.div>
          )}

          {activeTab === 'report' && (
             <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-6xl mx-auto">
                <Header title="Central de Envio" subtitle="Gere conteúdos formatados para compartilhar no WhatsApp da equipe." />
                <ReportPanel db={db} />
             </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl mx-auto">
               <Header title="Ajustes do Sistema" subtitle="Configure os dados da sua base ministerial." />
               <SettingsPanel db={db} setDb={setDb} showToast={showToast} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* --- Modals & Overlays --- */}
      <Modal isOpen={isMemberModalOpen} onClose={() => setIsMemberModalOpen(false)} title={editingMember ? 'Perfil do Membro' : 'Novo Integrante'}>
        <form onSubmit={saveMember} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Identificação</label>
            <input name="name" defaultValue={editingMember?.name} placeholder="Nome e Sobrenome" required className="w-full px-5 py-3 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Contato (WhatsApp)</label>
            <div className="relative">
              <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input name="phone" defaultValue={editingMember?.phone} placeholder="(00) 00000-0000" className="w-full pl-11 pr-5 py-3 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none" />
            </div>
          </div>
          <div className="space-y-3">
             <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Janela de Disponibilidade Fixa</label>
             <div className="flex flex-wrap gap-2">
               {DAYS_SHORT.map((day, i) => (
                 <label key={day} className="cursor-pointer group">
                   <input type="checkbox" name="days" value={i} defaultChecked={editingMember?.availableDays.includes(i)} className="hidden peer" />
                   <div className="px-4 py-2 rounded-xl border border-gray-100 text-xs font-bold text-gray-500 peer-checked:bg-emerald-600 peer-checked:border-emerald-600 peer-checked:text-white transition-all group-active:scale-95">
                     {day}
                   </div>
                 </label>
               ))}
             </div>
             <p className="text-[10px] text-gray-400 font-medium leading-relaxed italic">Dica: Se não marcar nada, entende-se disponibilidade total.</p>
          </div>

          <div className="space-y-4">
             <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Restrições de Data (Exceções)</label>
             <div className="flex gap-2">
               <input 
                 type="date" 
                 id="unavailable-date-picker"
                 className="flex-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-emerald-500" 
               />
               <button 
                 type="button"
                 onClick={() => {
                    const input = document.getElementById('unavailable-date-picker') as HTMLInputElement;
                    if (input.value && !editingMember?.unavailableDates?.includes(input.value)) {
                      const newDates = [...(editingMember?.unavailableDates || []), input.value].sort();
                      setEditingMember(prev => prev ? { ...prev, unavailableDates: newDates } : null);
                      input.value = '';
                    }
                 }}
                 className="p-3 bg-[#1a1a2e] text-white rounded-xl hover:bg-slate-800 transition shadow-lg"
               >
                 <Plus size={18} />
               </button>
             </div>
             
             <div className="flex flex-wrap gap-2">
                {editingMember?.unavailableDates?.map(date => (
                  <div key={date} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-black border border-red-100 animate-in fade-in zoom-in-95">
                    {format(parse(date, 'yyyy-MM-dd', new Date()), "dd/MM/yy")}
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingMember(prev => prev ? { 
                          ...prev, 
                          unavailableDates: prev.unavailableDates?.filter(d => d !== date) 
                        } : null);
                      }}
                      className="hover:scale-125 transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {(!editingMember?.unavailableDates || editingMember.unavailableDates.length === 0) && (
                  <p className="text-[10px] text-gray-400 italic">Nenhum impedimento específico agendado.</p>
                )}
             </div>
          </div>
          {/* {editingMember && <MemberStats member={editingMember} scales={db.scales} />} */}
          <div className="flex gap-3 pt-4">
             <button type="button" onClick={() => setIsMemberModalOpen(false)} className="flex-1 py-3 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-2xl transition">Cancelar</button>
             <button type="submit" className="flex-[2] py-4 bg-[#1a1a2e] text-white rounded-2xl text-sm font-black shadow-xl hover:bg-[#252541] transition active:scale-95">Concluir Cadastro</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isDayModalOpen} onClose={() => setIsDayModalOpen(false)} title={selectedDate ? format(parse(selectedDate, 'yyyy-MM-dd', new Date()), "eeee, dd 'de' MMMM", { locale: ptBR }) : ''} wide>
        <DayScaleManager 
          selectedDate={selectedDate}
          scale={currentScale}
          members={db.members}
          onSave={saveScale}
          onDelete={deleteScale}
          onSwap={handleSwap}
          onUndoSwap={undoSwap}
          suggestMembers={suggestMembers}
          dbScales={db.scales}
        />
      </Modal>

      <Modal isOpen={isFullMonthModalOpen} onClose={() => setIsFullMonthModalOpen(false)} title="Sortear Mês Todo" wide>
        <FullMonthGenerator onGenerate={generateFullMonthScales} onCancel={() => setIsFullMonthModalOpen(false)} />
      </Modal>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className={cn("fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl border-l-[6px] flex items-center gap-4 bg-white", toast.type === 'success' ? "border-emerald-500 text-gray-900" : toast.type === 'error' ? "border-red-500 text-gray-900" : "border-amber-500 text-gray-900")}>
            <div className={cn("w-2 h-2 rounded-full animate-pulse", toast.type === 'success' ? "bg-emerald-500" : toast.type === 'error' ? "bg-red-500" : "bg-amber-500")} />
            <span className="text-sm font-black">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Internal View Components ---

function MobileNavBtn({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={cn("flex flex-col items-center gap-1 px-1 py-2 rounded-2xl transition-all flex-1", active ? "text-emerald-600 font-black" : "text-slate-400 font-bold")}>
      <span className={cn("transition-transform", active && "scale-110")}>{icon}</span>
      <span className="text-[9px] uppercase tracking-wider text-center">{label}</span>
    </button>
  );
}

function SidebarNavBtn({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm", active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-white/40 hover:bg-white/5 hover:text-white/70")}>
      {icon} {label}
    </button>
  );
}

function DashboardStat({ icon, label, value, trend, color = "emerald" }: any) {
  const colors: any = {
    emerald: "text-emerald-500 bg-emerald-50 border-emerald-100",
    amber: "text-amber-500 bg-amber-50 border-amber-100",
    blue: "text-blue-500 bg-blue-50 border-blue-100"
  };
  return (
    <div className="bg-white p-5 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
      <div className={cn("w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-xl md:text-2xl mb-4 md:mb-6 border", colors[color])}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <div className="flex items-end gap-2">
          <p className="text-3xl md:text-4xl font-black text-slate-900 tabular-nums">{value}</p>
          <span className="text-[10px] font-bold text-slate-300 uppercase mb-1.5">{trend}</span>
        </div>
      </div>
    </div>
  );
}

function CompactMemberCard({ member }: any) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-50 flex items-center gap-3 shadow-sm">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm", member.flagged ? "bg-amber-500" : "bg-slate-800")}>
        {member.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-slate-900 leading-tight">{member.name}</p>
        <p className="text-xs font-bold text-slate-400 uppercase">Prioritário</p>
      </div>
      <Star size={14} className="fill-amber-400 text-amber-400" />
    </div>
  );
}



function Header({ title, subtitle }: any) {
  return (
    <div className="mb-10">
      <h2 className="text-3xl font-black tracking-tight text-gray-900 leading-tight">{title}</h2>
      <p className="text-sm font-medium text-gray-500/80 mt-1">{subtitle}</p>
    </div>
  );
}



function Card({ title, children, icon, className, p0 = false }: any) {
  return (
    <div className={cn("bg-white rounded-3xl border border-gray-100 shadow-sm transition hover:shadow-md", !p0 && "p-7", className)}>
      {title && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-emerald-600">{icon}</span>
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-700">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

function MemberListItem({ member, lastScale, totalScales, onEdit, onDelete, onToggleFlag, showActions = true, hideMeta = false }: any) {
  return (
    <div className="bg-white p-4 sm:p-5 rounded-[2rem] border border-slate-100 flex items-center gap-3 sm:gap-5 transition hover:border-emerald-200 group shadow-sm overflow-hidden">
      <div className={cn("w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg sm:text-xl flex-shrink-0 shadow-sm transition-transform group-hover:scale-105", member.flagged ? "bg-amber-500" : "bg-slate-800")}>
        {member.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="font-bold text-sm sm:text-base text-slate-900 leading-tight truncate">{member.name}</h4>
          {member.flagged && <Star size={14} className="fill-amber-400 text-amber-400 shrink-0" />}
        </div>
        {!hideMeta && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
             <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-tight whitespace-nowrap">{totalScales || 0} Ativ.</span>
             {lastScale && (
               <div className="flex items-center gap-1.5 sm:gap-2">
                 <div className="hidden sm:block w-1 h-1 rounded-full bg-slate-200" />
                 <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600/70 uppercase tracking-tight whitespace-nowrap">Visto {format(parse(lastScale, 'yyyy-MM-dd', new Date()), "dd/MM")}</span>
               </div>
             )}
          </div>
        )}
      </div>
      {showActions && (
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          <button onClick={onToggleFlag} className={cn("p-1.5 sm:p-2 rounded-xl transition", member.flagged ? "text-amber-500 bg-amber-50" : "text-slate-300 hover:bg-slate-50")}><Star size={16} fill={member.flagged ? "currentColor" : "none"} /></button>
          <button onClick={onEdit} className="p-1.5 sm:p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition"><MoreHorizontal size={16} /></button>
          <button onClick={onDelete} className="p-1.5 sm:p-2 text-red-100 hover:bg-red-50 text-red-500 rounded-xl transition"><Trash2 size={16} /></button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, text, subtitle }: any) {
  return (
    <div className="text-center py-16 px-6 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100">
      <div className="w-20 h-20 bg-white shadow-sm text-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-8 text-4xl">{icon}</div>
      <h5 className="font-black text-slate-900 text-xl">{text}</h5>
      {subtitle && <p className="text-sm font-medium text-slate-400 mt-3 max-w-[240px] mx-auto leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function CalendarDay({ day, isCurrentMonth, scale, members, onClick }: any) {
  const isW = getDay(day) === 0 || getDay(day) === 6;
  return (
    <div onClick={onClick} className={cn("min-h-[120px] p-3 border-r border-b border-gray-50 cursor-pointer transition-all hover:bg-emerald-50/40 relative group", !isCurrentMonth && "bg-gray-50/50 opacity-20 pointer-events-none", scale && "bg-emerald-50/20")}>
      <span className={cn("text-[11px] font-black inline-block mb-3", isToday(day) ? "bg-emerald-600 text-white w-7 h-7 rounded-lg flex items-center justify-center font-black" : isW ? "text-red-500 opacity-60" : "text-gray-300")}>{format(day, 'd')}</span>
      {scale && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-black uppercase text-emerald-800 line-clamp-1">{scale.event}</p>
          <div className="flex flex-wrap gap-1">
            {scale.members.slice(0, 4).map(id => {
              const m = members.find((x: any) => x.id === id);
              return m ? <div key={id} className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center text-[8px] font-black shadow-sm ring-1 ring-white">{m.name.charAt(0)}</div> : null;
            })}
            {scale.members.length > 4 && <div className="w-5 h-5 rounded-md bg-gray-400 text-white flex items-center justify-center text-[7px] font-black">+{scale.members.length - 4}</div>}
          </div>
        </div>
      )}
      <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="text-emerald-400" size={16} /></div>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children, wide }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} className={cn("relative bg-white rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col max-h-[90vh]", wide ? "w-full max-w-4xl" : "w-full max-w-lg")}>
        <div className="px-10 py-8 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-2xl font-black capitalize tracking-tight">{title}</h3>
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center hover:bg-gray-100 rounded-2xl transition-colors text-gray-400">✕</button>
        </div>
        <div className="p-6 md:p-10 overflow-y-auto flex-1 scrollbar-thin">{children}</div>
      </motion.div>
    </div>
  );
}

function DayScaleManager({ selectedDate, scale, members, onSave, onDelete, onSwap, onUndoSwap, suggestMembers, dbScales }: any) {
  const [eventName, setEventName] = useState(scale?.event || 'Culto');
  const [qty, setQty] = useState(scale?.members.length || 4);
  const [mode, setMode] = useState<'auto' | 'manual'>(scale ? 'manual' : 'auto');
  const [manualSelection, setManualSelection] = useState<string[]>(scale?.members || []);
  const [autoSuggestion, setAutoSuggestion] = useState<Member[]>([]);
  const [serviceType, setServiceType] = useState<ServiceType>(scale?.serviceType || 'evening');
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    if (selectedDate && mode === 'auto') setAutoSuggestion(suggestMembers(selectedDate, qty));
  }, [selectedDate, qty, mode]);

  const handleAISuggest = async () => {
    if (!selectedDate) return;
    setIsAiLoading(true);
    try {
      const db: AppDB = { 
        members, 
        scales: dbScales, 
        settings: { church: '', ministry: '', leader: '' } // Settings don't matter much for basic suggestions
      };
      const suggestedIds = await getAISmartSuggestion(db, selectedDate, serviceType, qty);
      setManualSelection(suggestedIds);
      setMode('manual');
    } catch (err) {
      console.error(err);
      // Fallback to local suggestion if AI fails
      const suggestedIds = suggestMembers(selectedDate, qty, true).map(m => m.id);
      setManualSelection(suggestedIds);
      setMode('manual');
    } finally {
      setIsAiLoading(false);
    }
  };

  const currentIds = mode === 'auto' ? autoSuggestion.map(m => m.id) : manualSelection;
  const dow = selectedDate ? getDay(parse(selectedDate, 'yyyy-MM-dd', new Date())) : -1;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-6 md:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tipo de Serviço</label>
               <select 
                 value={serviceType} 
                 onChange={e => {
                   const val = e.target.value as ServiceType;
                   setServiceType(val);
                   setEventName(SERVICE_LABELS[val]);
                 }} 
                 className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-bold focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 outline-none appearance-none"
               >
                 {(Object.keys(SERVICE_LABELS) as ServiceType[]).map(key => (
                   <option key={key} value={key}>{SERVICE_LABELS[key]}</option>
                 ))}
               </select>
            </div>
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Título Personalizado</label>
               <input value={eventName} onChange={e => setEventName(e.target.value)} className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-bold focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 outline-none" placeholder="Ex: Culto de Celebração" />
            </div>
          </div>
          <div className="space-y-4">
             <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Configuração de Vagas</label>
             <div className="flex items-center justify-between bg-gray-50 p-2 rounded-[2rem] border border-gray-100">
               <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-xl font-black hover:bg-emerald-50 hover:text-emerald-600 transition-all active:scale-95">−</button>
               <div className="flex flex-col items-center">
                 <span className="text-3xl font-black tabular-nums">{qty}</span>
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Diáconos</span>
               </div>
               <button onClick={() => setQty(q => q + 1)} className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-xl font-black hover:bg-emerald-50 hover:text-emerald-600 transition-all active:scale-95">+</button>
             </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
           <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Método de Seleção</label>
           <div className="flex bg-gray-100 p-1.5 rounded-3xl h-full pb-3">
             <button onClick={() => setMode('auto')} className={cn("flex-1 flex flex-col items-center py-4 rounded-2xl transition-all", mode === 'auto' ? "bg-white text-emerald-600 shadow-xl" : "text-gray-400 hover:text-gray-600")}>
               <RefreshCw size={24} className="mb-2" />
               <span className="text-xs font-black">Algoritmo</span>
             </button>
             <button onClick={() => setMode('manual')} className={cn("flex-1 flex flex-col items-center py-4 rounded-2xl transition-all", mode === 'manual' ? "bg-white text-emerald-600 shadow-xl" : "text-gray-400 hover:text-gray-600")}>
               <UserPlus size={24} className="mb-2" />
               <span className="text-xs font-black">Manual</span>
             </button>
           </div>
        </div>
      </div>

      <div className="space-y-4">
         <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-50 pb-4">Status da Escala</h4>
         {mode === 'auto' ? (
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
             {autoSuggestion.map((m, i) => (
                <div key={m.id} className="flex items-center gap-4 p-4 bg-emerald-50/50 border border-emerald-100 rounded-3xl transition animate-in fade-in slide-in-from-bottom-2">
                   <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-lg shadow-emerald-900/10 text-sm">#{i+1}</div>
                   <div>
                     <p className="text-sm font-black text-emerald-900 leading-tight">{m.name}</p>
                     <p className="text-[10px] font-bold text-emerald-600/60 uppercase">ÓTIMA ADERÊNCIA</p>
                   </div>
                </div>
             ))}
             {autoSuggestion.length === 0 && <div className="sm:col-span-2 py-10 text-center text-gray-400 font-bold">Nenhum membro disponível para sorteio automático.</div>}
             <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
               <button 
                onClick={handleAISuggest} 
                disabled={isAiLoading || !ai}
                className={cn(
                  "py-4 bg-emerald-600 text-white rounded-3xl text-xs font-black transition-all flex items-center justify-center gap-3 active:scale-[0.98] shadow-lg shadow-emerald-900/20",
                  (!ai || isAiLoading) && "opacity-50 cursor-not-allowed"
                )}
               >
                 {isAiLoading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                 Sugerir com IA Smart
               </button>
               <button onClick={() => setAutoSuggestion(suggestMembers(selectedDate!, qty, true))} className="py-4 bg-white border-2 border-dashed border-emerald-100 rounded-3xl text-emerald-600 font-black text-xs hover:bg-emerald-50 transition-all flex items-center justify-center gap-3 active:scale-[0.98]">
                 <RefreshCw size={16} /> Embaralhar Novos Candidatos
               </button>
             </div>
           </div>
         ) : (
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
             {members.sort((a:any,b:any) => a.name.localeCompare(b.name)).map((m:any) => {
               const isDayOk = m.availableDays.length === 0 || m.availableDays.includes(dow);
               const isDateRestricted = m.unavailableDates?.includes(selectedDate!);
               const isAvailable = isDayOk && !isDateRestricted;
               const isSelected = manualSelection.includes(m.id);
               
               return (
                 <div 
                   key={m.id} 
                   onClick={() => {
                     if (!isAvailable) return;
                     setManualSelection(p => p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id]);
                   }} 
                   className={cn(
                     "p-4 rounded-3xl border-2 flex items-center justify-between transition-all relative overflow-hidden",
                     !isAvailable ? "opacity-30 border-gray-100 bg-gray-50/50 cursor-not-allowed grayscale pointer-events-none" : 
                     isSelected ? "bg-emerald-50 border-emerald-500 shadow-md ring-4 ring-emerald-500/10 active:scale-95 cursor-pointer" : 
                     "bg-white border-gray-50 group hover:border-emerald-100 active:scale-95 cursor-pointer"
                   )}
                 >
                    <div className="flex items-center gap-4">
                       <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center transition-colors shadow-sm", isSelected ? "bg-emerald-500 text-white" : "bg-gray-100 text-transparent")}>
                         <Check size={14} strokeWidth={4} />
                       </div>
                       <div>
                         <p className={cn("text-sm font-black", !isAvailable ? "text-slate-400" : "text-gray-900")}>{m.name}</p>
                         {isDateRestricted && <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 uppercase tracking-tighter">DATA BLOQUEADA</span>}
                         {!isDayOk && !isDateRestricted && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter">INDISPONÍVEL NESTE DIA</span>}
                       </div>
                    </div>
                    {!isAvailable && <X size={16} className="text-red-400 opacity-50" />}
                 </div>
               );
             })}
           </div>
         )}
      </div>

      {scale && (
        <div className="p-6 bg-slate-900 rounded-[2rem] relative overflow-hidden">
           <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none"><ArrowRightLeft size={160} /></div>
           <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-6 flex items-center gap-3">Painel de Troca Rápida</h5>
           <form className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10" onSubmit={e => {
             e.preventDefault();
             const form = e.currentTarget;
             const d = new FormData(form);
             const outId = d.get('outId') as string;
             const inId = d.get('inId') as string;
             if (!outId || !inId) return;
             onSwap(outId, inId);
             setManualSelection(prev => prev.map(id => id === outId ? inId : id));
             form.reset();
           }}>
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Remover da Lista</label>
                <select name="outId" className="w-full px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none">
                  {scale.members.map(id => <option key={id} value={id} className="text-black">{members.find((x:any) => x.id === id)?.name}</option>)}
                </select>
             </div>
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Substituir por</label>
                <select name="inId" className="w-full px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none">
                  {members.filter((m:any) => !scale.members.includes(m.id) && isMemberAvailable(m, selectedDate!)).map((m:any) => <option key={m.id} value={m.id} className="text-black">{m.name}</option>)}
                </select>
             </div>
             <button type="submit" className="sm:col-span-2 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-3 active:scale-95 px-6 leading-tight">
               Executar Troca e Atribuir Prioridade Automática
             </button>
           </form>

           {scale.swaps && scale.swaps.length > 0 && (
             <div className="mt-6 pt-6 border-t border-white/5">
               <h6 className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Histórico de Alterações</h6>
               <div className="space-y-2">
                 {scale.swaps.map((sw: any, idx: number) => {
                   const from = members.find((m: any) => m.id === sw.fromId);
                   const to = members.find((m: any) => m.id === sw.toId);
                   return (
                     <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group animate-in fade-in slide-in-from-top-1">
                        <div className="flex items-center gap-3">
                           <span className="text-red-400 font-bold text-xs">{from?.name || 'Membro'}</span>
                           <ArrowRightLeft size={10} className="text-white/20" />
                           <span className="text-emerald-400 font-bold text-xs">{to?.name || 'Substituto'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                           <span className="text-[9px] font-bold text-white/10">{format(sw.at, 'dd/MM/yy')}</span>
                           <button 
                             onClick={() => {
                               const sw = scale.swaps[idx];
                               onUndoSwap(scale.id, idx);
                               if(sw) setManualSelection((prev: string[]) => prev.map(id => id === sw.toId ? sw.fromId : id));
                             }}
                             className="p-1 text-white/20 hover:text-red-400 transition-colors"
                             title="Desfazer"
                           >
                             <X size={12} />
                           </button>
                        </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}
        </div>
      )}

      <div className="flex gap-3 pt-6 border-t border-gray-50 bg-white sticky bottom-0">
        {scale && (
          <button onClick={() => onDelete(scale.date)} className="p-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition ring-1 ring-red-100 flex items-center justify-center w-14 shrink-0 transition-all active:scale-90">
            <Trash2 size={18} />
          </button>
        )}
        <button onClick={() => onSave(currentIds, eventName, serviceType)} className="flex-1 py-3 bg-[#1a1a2e] text-white rounded-xl text-xs font-black shadow-lg hover:bg-slate-900 transition-all active:scale-[0.98]">
          Garantir Escala Final
        </button>
      </div>
    </div>
  );
}

function ReportPanel({ db }: any) {
  const [t, setT] = useState('single');
  const [sid, setSid] = useState('');
  const [mo, setMo] = useState(format(new Date(), 'yyyy-MM'));
  const [customChurch, setCustomChurch] = useState(db.settings.church || '');
  const [motivation, setMotivation] = useState('');

  const gen = () => {
    const min = db.settings.ministry.toUpperCase();
    const chu = customChurch || db.settings.church || 'Igreja Local';
    const finalMotivation = motivation || 'Que Deus abençoe a todos! 🙏';

    if(t === 'single') {
       const sc = db.scales.find(s => s.id === sid);
       if(!sc) return '';
       const mbs = sc.members.map(id => db.members.find(m => m.id === id)?.name).filter(Boolean);
       return `🕊️ *${min}*\n📋 *${sc.event.toUpperCase()}*\n📅 ${format(parse(sc.date, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", { locale: ptBR })}\n\n*ESCALA DO DIA:*\n${mbs.map((n,i)=>`${i+1}. ${n}`).join('\n')}\n\n_${chu}_\n_${finalMotivation}_`;
    }
    const ms = db.scales.filter(s => s.date.startsWith(mo)).sort((a,b)=>a.date.localeCompare(b.date));
    if(!ms.length) return 'Nenhuma atividade no período.';
    let txt = `🕊️ *${min}*\n🗓 *ESCALA DE ${format(parse(mo, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: ptBR }).toUpperCase()}*\n\n`;
    ms.forEach(s => {
       const mbs = s.members.map(id => db.members.find(m => m.id === id)?.name).filter(Boolean);
       txt += `📋 *${s.event.toUpperCase()}* — ${format(parse(s.date,'yyyy-MM-dd', new Date()),"dd/MM")}\n${mbs.map((n,i)=>`  ${i+1}. ${n}`).join('\n')}\n\n`;
    });
    return txt + `_${chu}_\n_${finalMotivation}_`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
       <Card title="Geração de Conteúdo" icon={<Share2 size={16} />}>
         <div className="space-y-6">
           <div className="flex bg-gray-100 p-1.5 rounded-2xl">
             <button onClick={() => setT('single')} className={cn("flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition", t === 'single' ? "bg-white text-[#1a1a2e] shadow-lg" : "text-gray-400")}>Unidade</button>
             <button onClick={() => setT('month')} className={cn("flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition", t === 'month' ? "bg-white text-[#1a1a2e] shadow-lg" : "text-gray-400")}>Mensalidade</button>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nome da Igreja (Opcional)</label>
              <input value={customChurch} onChange={e => setCustomChurch(e.target.value)} placeholder="Ex: Igreja Central" className="w-full h-12 px-4 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white transition-all text-xs font-bold outline-none" />
            </div>
            {t === 'single' ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Atividade</label>
                <select value={sid} onChange={e => setSid(e.target.value)} className="w-full h-12 px-4 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white transition-all text-xs font-bold outline-none">
                  <option value="">Selecione...</option>
                  {[...db.scales].sort((a,b)=>b.date.localeCompare(a.date)).map(s => <option key={s.id} value={s.id}>{format(parse(s.date,'yyyy-MM-dd', new Date()),"dd/MM")} - {s.event}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mês</label>
                <input type="month" value={mo} onChange={e=>setMo(e.target.value)} className="w-full h-12 px-4 border border-gray-100 rounded-xl bg-gray-50 font-bold text-xs outline-none" />
              </div>
            )}
           </div>

           <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Frase Motivacional (Opcional)</label>
              <textarea value={motivation} onChange={e => setMotivation(e.target.value)} placeholder="Ex: Contamos com sua presença! Deus o abençoe." className="w-full h-20 p-4 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white transition-all text-xs font-bold outline-none resize-none" />
           </div>

           <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
             <button onClick={() => { navigator.clipboard.writeText(gen()); }} className="py-4 border-2 border-emerald-100 text-emerald-700 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-50 transition active:scale-95"><Copy size={18} /> Copiar</button>
             <button onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(gen())}`, '_blank'); }} className="py-4 bg-[#1a1a2e] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:shadow-xl transition active:scale-95"><Share2 size={18} /> WhatsApp</button>
           </div>
         </div>
       </Card>
       <div className="bg-[#1a1a2e] rounded-[3rem] p-10 relative overflow-hidden shadow-2xl flex flex-col min-h-[500px]">
          <div className="absolute -top-10 -right-10 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl" />
          <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-8">Digital Preview</p>
          <textarea readOnly value={gen()} className="flex-1 bg-transparent text-emerald-500 font-mono text-sm leading-relaxed resize-none focus:outline-none placeholder:text-white/10" placeholder="Aguardando parâmetros..." />
          <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-center gap-4 text-white/20">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
             <span className="text-[10px] font-black uppercase tracking-widest">Pronto para Compartilhamento</span>
          </div>
       </div>
    </div>
  );
}

function SettingsPanel({ db, setDb, showToast }: any) {
  return (
    <Card p0 className="overflow-hidden bg-[#1a1a2e]">
      <div className="p-10 border-b border-white/5">
        <h4 className="text-white font-black text-xl mb-8 flex items-center gap-4"><SettingsIcon size={24} className="text-emerald-500" /> Parâmetros de Identificação</h4>
        <form className="space-y-6" onSubmit={e => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          setDb((p: any) => ({ ...p, settings: { church: d.get('ch'), ministry: d.get('min') || 'Diaconia', leader: d.get('ld') } }));
          showToast('Banco de dados ministerial atualizado');
        }}>
           <div className="space-y-1.5">
             <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Instituição (Igreja)</label>
             <input name="ch" defaultValue={db.settings.church} className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" />
           </div>
           <div className="space-y-1.5">
             <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Departamento (Ministério)</label>
             <input name="min" defaultValue={db.settings.ministry} className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" />
           </div>
           <div className="space-y-1.5">
             <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Responsabilidade Principal</label>
             <input name="ld" defaultValue={db.settings.leader} className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" />
           </div>
           <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95 shadow-xl shadow-emerald-900/40">Consolidar Registros</button>
        </form>
      </div>
      <div className="p-10 bg-black/40">
         <h5 className="text-red-500 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-3"><AlertTriangle size={18} /> Administração de Dados Críticos</h5>
         <p className="text-white/40 text-xs leading-relaxed mb-6">A limpeza de dados removerá todo o histórico de escalas e o corpo de voluntários. Seus dados estão armazenados localmente neste navegador.</p>
         <button onClick={() => { if(confirm('Reset total?')) { localStorage.removeItem(DB_KEY); window.location.reload(); } }} className="w-full py-4 border-2 border-red-500/20 text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Destruir Base de Dados Local</button>
      </div>
    </Card>
  );
}

function NextScaleInfo({ db, onNavigate }: any) {
  const [isCopied, setIsCopied] = useState(false);

  const ns = useMemo(() => {
    const t = format(new Date(), 'yyyy-MM-dd');
    return db.scales.filter((s:any)=>s.date >= t).sort((a:any,b:any)=>a.date.localeCompare(b.date))[0];
  }, [db.scales]);

  const shareText = useMemo(() => {
    if (!ns) return '';
    const mbs = ns.members.map(id => db.members.find(m => m.id === id)?.name).filter(Boolean);
    const dateStr = format(parse(ns.date, 'yyyy-MM-dd', new Date()), "eeee, dd/MM", { locale: ptBR });
    return `🕊️ *${db.settings.ministry.toUpperCase()}*\n📋 *${ns.event.toUpperCase()}*\n📅 ${dateStr}\n\n*EQUIPE ESCALADA:*\n${mbs.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\n_Contamos com sua presença! 🙏_`;
  }, [ns, db.members, db.settings.ministry]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  if (!ns) return (
    <div className="flex flex-col items-center justify-center p-10 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100">
       <div className="w-16 h-16 bg-white rounded-2xl shadow-sm text-slate-200 flex items-center justify-center mb-4"><CalendarIcon size={32} /></div>
       <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sem atividades agendadas</p>
       <button onClick={onNavigate} className="mt-4 px-6 py-2.5 bg-[#0F172A] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition shadow-lg">Definir Próxima</button>
    </div>
  );

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between p-6 bg-[#0F172A] rounded-3xl text-white shadow-xl shadow-slate-900/20">
          <div>
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">{ns.event}</p>
            <h5 className="text-2xl font-black capitalize">{format(parse(ns.date, 'yyyy-MM-dd', new Date()), "eeee, dd/MM", { locale: ptBR })}</h5>
          </div>
          <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-500"><CalendarIcon size={24} /></div>
       </div>
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ns.members.map((id:any) => {
            const m = db.members.find((x:any)=>x.id === id);
            return m ? (
              <div key={id} className="p-3 bg-white rounded-2xl flex items-center gap-3 border border-slate-100 shadow-sm transition animate-in fade-in zoom-in-95">
                 <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-[#0F172A] font-black text-xs border border-slate-100">{m.name.charAt(0)}</div>
                 <span className="text-sm font-black text-slate-700 leading-tight">{m.name}</span>
              </div>
            ) : null;
          })}
       </div>
        <div className="flex gap-2">
          <button onClick={handleWhatsApp} className="flex-1 py-4 bg-emerald-600 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 active:scale-95 leading-none">
            <MessageCircle size={16} /> WhatsApp
          </button>
          <button onClick={handleCopy} className={cn("flex-1 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 active:scale-95 leading-none", isCopied ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-white text-slate-900 shadow-slate-200 border-slate-100")}>
            {isCopied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar</>}
          </button>
        </div>
        <button onClick={onNavigate} className="w-full py-4 border-2 border-slate-100 border-dashed rounded-3xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all">Ajustar Escala no Calendário</button>
    </div>
  );
}


function MinistryHealthDashboard({ db }: { db: AppDB }) {
  const stats = useMemo(() => {
    const totalMembers = db.members.length;
    const totalScales = db.scales.length;
    
    // Member engagement data
    const memberEngagement = db.members.map(m => {
      const counts = db.scales.filter(s => s.members.includes(m.id)).length;
      const lastScale = db.scales
        .filter(s => s.members.includes(m.id))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      
      const lastDate = lastScale ? parse(lastScale.date, 'yyyy-MM-dd', new Date()) : null;
      const daysSinceLast = lastDate ? differenceInDays(new Date(), lastDate) : 999;
      
      return { 
        name: m.name, 
        count: counts, 
        daysSinceLast,
        isInactive: daysSinceLast > 60 && totalScales > 5,
        isBurnout: counts > 8 && totalScales > 10 // Arbitrary logic for demo
      };
    }).sort((a, b) => b.count - a.count);

    // Timeline data (last 6 months)
    const months = Array.from({ length: 6 }).map((_, i) => {
        const d = subMonths(new Date(), i);
        return format(d, 'MMM/yy', { locale: ptBR });
    }).reverse();

    const timelineData = months.map(m => {
        const [monthName, year] = m.split('/');
        const count = db.scales.filter(s => {
            const date = parse(s.date, 'yyyy-MM-dd', new Date());
            const monthStr = format(date, 'MMM/yy', { locale: ptBR });
            return monthStr === m;
        }).length;
        return { name: m, Escalas: count };
    });

    const inactiveMembers = memberEngagement.filter(m => m.isInactive);
    const burnoutMembers = memberEngagement.filter(m => m.isBurnout);

    return { totalMembers, totalScales, memberEngagement, timelineData, inactiveMembers, burnoutMembers };
  }, [db]);

  const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-8 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <DashboardStat icon={<Heart className="text-rose-500"/>} label="Saúde Geral" value={db.members.length > 0 ? "Estável" : "N/A"} trend="Status" color="emerald" />
        <DashboardStat icon={<AlertTriangle className="text-amber-500"/>} label="Risco Inativo" value={stats.inactiveMembers.length} trend="Membros" color="amber" />
        <DashboardStat icon={<TrendingUp className="text-blue-500"/>} label="Escalas/Mês" value={Math.round(stats.totalScales / 6) || 0} trend="Média" color="blue" />
        <DashboardStat icon={<Users className="text-emerald-500"/>} label="Time Ativo" value={db.members.length - stats.inactiveMembers.length} trend="Voluntários" color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Adesão ao Ministério" icon={<TrendingUp size={16}/>}>
           <div className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.timelineData}>
                  <defs>
                    <linearGradient id="colorEscalas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="Escalas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorEscalas)" />
                </AreaChart>
              </ResponsiveContainer>
           </div>
        </Card>

        <Card title="Carga de Trabalho" icon={<PieChartIcon size={16}/>}>
           <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.memberEngagement.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                  >
                    {stats.memberEngagement.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
           </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
            <Card title="Distribuição de Frequência" icon={<BarChart3 size={16}/>}>
               <div className="h-[400px] w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.memberEngagement.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 'bold'}} width={100} />
                      <RechartsTooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="count" fill="#10b981" radius={[0, 10, 10, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </Card>
        </div>

        <div className="space-y-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Heart size={14} className="text-rose-500" />
                Alertas de Cuidado
            </h3>
            
            {stats.inactiveMembers.length > 0 && (
                <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 space-y-4">
                    <div className="flex items-center gap-2 text-amber-600 font-bold text-xs uppercase tracking-wider">
                        <AlertTriangle size={14} /> Possível Inatividade
                    </div>
                    <div className="space-y-3">
                        {stats.inactiveMembers.slice(0, 3).map(m => (
                            <div key={m.name} className="flex justify-between items-center text-sm">
                                <span className="font-bold text-slate-700">{m.name}</span>
                                <span className="text-xs bg-white px-2 py-1 rounded-lg border border-amber-200 text-amber-600 font-black">{m.daysSinceLast} dias fora</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-amber-600/70 font-medium italic">Considere entrar em contato para saber como eles estão.</p>
                </div>
            )}

            {stats.burnoutMembers.length > 0 && (
                <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 space-y-4">
                    <div className="flex items-center gap-2 text-rose-600 font-bold text-xs uppercase tracking-wider">
                        <Heart size={14} /> Risco de Sobrecarga
                    </div>
                    <div className="space-y-3">
                        {stats.burnoutMembers.slice(0, 3).map(m => (
                            <div key={m.name} className="flex justify-between items-center text-sm">
                                <span className="font-bold text-slate-700">{m.name}</span>
                                <span className="text-xs bg-white px-2 py-1 rounded-lg border border-rose-200 text-rose-600 font-black">{m.count} escalas</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-rose-600/70 font-medium italic">Estes voluntários estão servindo muito acima da média.</p>
                </div>
            )}

            {stats.inactiveMembers.length === 0 && stats.burnoutMembers.length === 0 && (
                <div className="p-10 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
                    <Check className="mx-auto mb-4 text-emerald-500" size={32} />
                    <p className="text-sm font-black text-slate-900">Time Saudável</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Nenhum alerta crítico detectado</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

function EngagementDashboard({ db }: { db: AppDB }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  
  const rankings = useMemo(() => {
    const monthPrefix = format(selectedMonth, 'yyyy-MM');
    const monthScales = db.scales.filter(s => s.date.startsWith(monthPrefix));
    
    return db.members.map(m => {
      const count = monthScales.filter(s => s.members.includes(m.id)).length;
      return { ...m, count };
    }).sort((a, b) => b.count - a.count);
  }, [db, selectedMonth]);

  const maxCount = Math.max(...rankings.map(r => r.count), 1);

  return (
    <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Visão do Mês</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition text-slate-400"><ChevronLeft size={16}/></button>
            <span className="text-sm font-black text-slate-900 capitalize">{format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}</span>
            <button onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition text-slate-400"><ChevronRight size={16}/></button>
          </div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-2xl">
          <LayoutDashboard size={24} className="text-emerald-500" />
        </div>
      </div>

      <div className="space-y-5">
        {rankings.slice(0, 5).map((r, i) => (
          <div key={r.id} className="space-y-2">
            <div className="flex justify-between items-end">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-black",
                  i === 0 ? "bg-amber-100 text-amber-600" : 
                  i === 1 ? "bg-slate-100 text-slate-600" : 
                  i === 2 ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-400"
                )}>
                  {i + 1}º
                </span>
                <span className="text-xs font-black text-slate-700">{r.name}</span>
              </div>
              <span className="text-xs font-black text-slate-400">{r.count} <span className="text-xs uppercase">atuações</span></span>
            </div>
            <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(r.count / maxCount) * 100}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={cn(
                  "h-full rounded-full",
                  i === 0 ? "bg-emerald-500" : i < 3 ? "bg-emerald-400" : "bg-slate-200"
                )}
              />
            </div>
          </div>
        ))}
        {rankings.length === 0 && (
          <div className="py-10 text-center text-slate-300 font-bold text-xs">Nenhum dado de participação este mês</div>
        )}
        {rankings.length > 5 && (
          <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest pt-4">Exibindo top 5 voluntários</p>
        )}
      </div>
    </div>
  );
}

function getDaysInMonth(d: Date) {
  const s = startOfWeek(startOfMonth(d));
  const e = endOfWeek(endOfMonth(d));
  return eachDayOfInterval({ start: s, end: e });
}

function FullMonthGenerator({ onGenerate, onCancel }: any) {
  const [selectedDows, setSelectedDows] = useState<number[]>([]);
  const [configs, setConfigs] = useState<Record<number, { name: string, qty: number }>>({
    0: { name: 'Culto', qty: 4 },
    3: { name: 'Culto', qty: 4 }
  });

  const toggleDow = (dow: number) => {
    setSelectedDows(prev => prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow]);
  };

  const updateConfig = (dow: number, key: 'name' | 'qty', val: any) => {
    setConfigs(prev => ({
      ...prev,
      [dow]: { ...(prev[dow] || { name: 'Culto', qty: 4 }), [key]: val }
    }));
  };

  return (
    <div className="space-y-8">
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
        <AlertTriangle className="text-amber-500 flex-shrink-0" size={18} />
        <p className="text-[11px] font-bold text-amber-800 leading-relaxed uppercase">Isso irá substituir todas as escalas já criadas para este mês no calendário.</p>
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dias da Semana com Culto</label>
        <div className="flex flex-wrap gap-2">
          {DAYS_SHORT.map((day, i) => (
            <button key={day} onClick={() => toggleDow(i)} className={cn("px-5 py-3 rounded-2xl text-xs font-black transition-all", selectedDows.includes(i) ? "bg-emerald-600 text-white shadow-lg" : "bg-gray-50 text-gray-400 hover:bg-gray-100")}>
              {day}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedDows.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-3">Configurações Específicas</h4>
            <div className="space-y-3">
              {[...selectedDows].sort((a,b)=>a-b).map(dow => (
                <div key={dow} className="flex flex-col sm:flex-row items-center gap-3 p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100">
                  <div className="w-14 h-10 bg-[#1a1a2e] text-white flex items-center justify-center rounded-xl text-xs font-black shrink-0">{DAYS_SHORT[dow]}</div>
                  <input 
                    value={configs[dow]?.name || ''} 
                    onChange={e => updateConfig(dow, 'name', e.target.value)}
                    placeholder="Nome do Evento"
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-gray-400">Pessoas:</span>
                    <input 
                      type="number" 
                      value={configs[dow]?.qty || ''} 
                      onChange={e => updateConfig(dow, 'qty', parseInt(e.target.value))}
                      className="w-16 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-center outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-4 pt-6 mt-6 border-t border-gray-50 bg-white sticky bottom-0">
        <button onClick={onCancel} className="flex-1 py-4 text-xs font-black text-gray-400 hover:bg-gray-100 rounded-2xl transition">Desistir</button>
        <button 
          disabled={selectedDows.length === 0}
          onClick={() => onGenerate(selectedDows, configs)} 
          className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black shadow-xl hover:bg-emerald-500 transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95"
        >
          Iniciar Sorteio Automático
        </button>
      </div>
    </div>
  );
}
