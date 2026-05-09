'use client';

import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Filler
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

ChartJS.register( CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, ChartLegend, Filler, annotationPlugin );

const MACRO_COLORS = ['#6366f1', '#10b981', '#f59e0b'];

const Clock = React.memo(() => {
    const [dateTime, setDateTime] = useState({ date: '', time: '' });
    useEffect(() => {
        const update = () => {
            const now = new Date();
            setDateTime({
                date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            });
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="date-time-display">
            <span style={{fontSize:'0.9rem', color:'var(--text-muted)'}}>{dateTime.date}</span>
            <span style={{fontSize:'1.1rem', fontWeight:600}}>{dateTime.time}</span>
        </div>
    );
});

export default function Dashboard() {
    const todayStr = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [activeTab, setActiveTab] = useState('journal');
    const [theme, setTheme] = useState('');
    const [units, setUnits] = useState('metric');
    const [showSettings, setShowSettings] = useState(false);
    const [isClient, setIsClient] = useState(false);
    
    const [allLogs, setAllLogs] = useState<Record<string, any>>({});
    const [dailyData, setDailyData] = useState({ weight: '', water: 0, sleep: 0, exercise: 0, calories: 0 });
    const [goals, setGoals] = useState({ weight: 70, water: 2.5, calories: 2000, exercise: 45, sleep: 8 });

    const [foodQuery, setFoodQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [selectedFood, setSelectedFood] = useState<any>(null);
    const [foodQty, setFoodQty] = useState('');
    const [foodUnit, setFoodUnit] = useState('g');
    const [calculatedKcal, setCalculatedKcal] = useState(0);
    const [calculatedMacros, setCalculatedMacros] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);
    const [manualKcal, setManualKcal] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    
    // AI Recipe States
    const [recipeSearch, setRecipeSearch] = useState('');
    const [recipePrefs, setRecipePrefs] = useState('');
    const [recipeResult, setRecipeResult] = useState<any>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        setIsClient(true);
        const savedTheme = localStorage.getItem('theme');
        const savedUnits = localStorage.getItem('units');
        const savedAllLogs = localStorage.getItem('allLogs');
        const savedGoals = localStorage.getItem('goals');
        
        if (savedTheme) setTheme(savedTheme || '');
        if (savedUnits) setUnits(savedUnits || 'metric');
        if (savedGoals) setGoals(JSON.parse(savedGoals));
        
        if (savedAllLogs) {
            const logs = JSON.parse(savedAllLogs);
            setAllLogs(logs);
            if (logs[todayStr]) setDailyData(logs[todayStr]);
        }
        const savedKey = localStorage.getItem('geminiKey');
        if (savedKey) setGeminiKey(savedKey || '');
    }, []);

    // Load data when date changes
    useEffect(() => {
        if (isClient) {
            setDailyData(allLogs[selectedDate] || { weight: '', water: 0, sleep: 0, exercise: 0, calories: 0 });
        }
    }, [selectedDate, allLogs, isClient]);

    useEffect(() => {
        if (isClient) {
            document.body.className = theme;
            localStorage.setItem('theme', theme);
            localStorage.setItem('units', units);
            localStorage.setItem('goals', JSON.stringify(goals));
            localStorage.setItem('geminiKey', geminiKey);
        }
    }, [theme, units, goals, geminiKey, isClient]);

    const updateMetric = (key: string, value: any) => {
        const updatedData = { ...dailyData, [key]: value };
        setDailyData(updatedData);
        const newAllLogs = { ...allLogs, [selectedDate]: updatedData };
        setAllLogs(newAllLogs);
        localStorage.setItem('allLogs', JSON.stringify(newAllLogs));
    };

    const handleAddFoodToTotal = (kcal: number) => {
        updateMetric('calories', (dailyData.calories || 0) + kcal);
    };

    const calculateStreaks = (dataKey: string, goal: number, isLowerBetter: boolean = false) => {
        let currentStreak = 0;
        let bestStreak = 0;
        const sortedDates = Object.keys(allLogs).sort().reverse();
        
        // Current Streak (Starting from today/yesterday)
        for (const date of sortedDates) {
            const val = allLogs[date][dataKey];
            const hit = isLowerBetter ? (val > 0 && val <= goal) : (val >= goal);
            if (hit) currentStreak++;
            else break;
        }

        // Best Streak (All time)
        let tempStreak = 0;
        Object.keys(allLogs).sort().forEach(date => {
            const val = allLogs[date][dataKey];
            const hit = isLowerBetter ? (val > 0 && val <= goal) : (val >= goal);
            if (hit) {
                tempStreak++;
                if (tempStreak > bestStreak) bestStreak = tempStreak;
            } else {
                tempStreak = 0;
            }
        });

        return { current: currentStreak, best: bestStreak };
    };

    const [apiStatus, setApiStatus] = useState<'idle' | 'searching' | 'error' | 'no-results'>('idle');

    const handleFoodSearch = async () => {
        if (foodQuery.length < 2) return;
        setApiStatus('searching');
        setIsSearching(true);
        try {
            console.log('Firing API Request for:', foodQuery);
            const res = await fetch(`/api/food-search?q=${encodeURIComponent(foodQuery)}`);
            if (!res.ok) throw new Error(`Server Error: ${res.status}`);
            const data = await res.json();
            if (data.products && data.products.length > 0) {
                setSuggestions(data.products);
                setApiStatus('idle');
            } else {
                setSuggestions([]);
                setApiStatus('no-results');
            }
        } catch (err) {
            console.error('Search Connection Error:', err);
            setApiStatus('error');
        } finally {
            setIsSearching(false);
        }
    };

    const calculateStats = (food: any, qty: string, unit: string) => {
        const q = parseFloat(qty);
        if (!food || isNaN(q)) { setCalculatedKcal(0); setCalculatedMacros([]); return; }
        
        let ratio = 1;
        let kcal = 0;

        if (unit === 'piece') {
            // Use pieces as direct multiplier if the source is piece-based
            ratio = food.isPiece ? q : (q * (food.servingWeight || 100) / 100);
            kcal = Math.round(q * food.kcal);
        } else {
            let weightInGrams = q;
            if (unit === 'ml') weightInGrams = q;
            if (unit === 'l') weightInGrams = q * 1000;
            if (unit === 'oz') weightInGrams = q * 28.35;
            if (unit === 'lb') weightInGrams = q * 453.59;
            
            const baseWeight = food.isPiece ? (food.servingWeight || 50) : 100;
            ratio = weightInGrams / baseWeight;
            kcal = Math.round(ratio * food.kcal);
        }

        setCalculatedKcal(kcal);
        setCalculatedMacros([
            { name: 'Protein', value: Math.round(ratio * (food.protein || 0)) },
            { name: 'Carbs', value: Math.round(ratio * (food.carbs || 0)) },
            { name: 'Fat', value: Math.round(ratio * (food.fat || 0)) }
        ]);
    };

    const handleGenerateRecipe = async () => {
        if (!geminiKey) {
            alert("Please add your Gemini API Key in Settings first!");
            return;
        }
        if (!recipeSearch) return;

        setIsGenerating(true);
        try {
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });

            const prompt = `Act as a master nutritionist and chef. Generate a healthy recipe for: ${recipeSearch}. 
            Dietary preferences/Ingredients on hand: ${recipePrefs}.
            Return ONLY a JSON object with this structure:
            {
                "title": "Dish Name",
                "description": "Short appetizing description",
                "calories": "Estimated kcal",
                "ingredients": ["item 1", "item 2"],
                "instructions": ["step 1", "step 2"]
            }`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanJson = text.replace(/```json|```/g, '').trim();
            setRecipeResult(JSON.parse(cleanJson));
        } catch (err) {
            console.error(err);
            alert("Chef had a glitch! Please check your API key or connection.");
        } finally {
            setIsGenerating(false);
        }
    };

    const getGraphHistory = () => {
        const history = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            const log = allLogs[dStr] || { weight: 0, water: 0, calories: 0, exercise: 0, sleep: 0 };
            history.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }), ...log });
        }
        return history;
    };

    const graphHistory = getGraphHistory();

    const renderMiniChart = (label: string, dataKey: string, goal: number, unitLabel: string) => {
        const hasData = graphHistory.some((l: any) => l[dataKey] > 0);
        const dataValues = graphHistory.map((l: any) => l[dataKey] || 0);
        const maxInput = Math.max(...dataValues);
        const minInput = Math.min(...dataValues.filter(v => v > 0));
        if (!hasData) return <div className="insight-card" style={{height:'220px', padding:'1rem', display:'flex', flexDirection:'column', justifyContent:'center'}}><h4 style={{fontSize:'0.75rem', marginBottom:'0.5rem', color:'var(--text-muted)'}}>{label.toUpperCase()}</h4><div style={{fontSize:'0.8rem', color:'var(--text-muted)', textAlign:'center'}}>Start logging to see progress!</div></div>;
        
        // Improved Scaling Logic
        const actualMin = Math.min(...dataValues.filter(v => v > 0), goal);
        const actualMax = Math.max(...dataValues, goal);
        let yMin = Math.floor(actualMin - (dataKey === 'weight' ? 1 : actualMin * 0.1));
        let roundedMax = Math.ceil(actualMax + (dataKey === 'weight' ? 1 : actualMax * 0.1));
        if (yMin < 0) yMin = 0;

        const data = { labels: graphHistory.map(l => l.day), datasets: [{ label, data: dataValues, borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.05)', fill: true, tension: 0.4, pointRadius: 2 }] };
        const options: any = {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, annotation: { annotations: { goalLine: { type: 'line', yMin: goal, yMax: goal, borderColor: 'rgba(99, 102, 241, 0.5)', borderWidth: 2, borderDash: [6, 6] } } } },
            scales: { x: { display: true, ticks: { font: { size: 10 } } }, y: { display: true, beginAtZero: dataKey !== 'weight', min: yMin, max: roundedMax, grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { font: { size: 10 }, precision: 0, stepSize: dataKey === 'calories' ? 100 : (dataKey === 'weight' ? 5 : 1) } } }
        };
        return <div className="insight-card" style={{height:'220px', padding:'1rem'}}><h4 style={{fontSize:'0.75rem', marginBottom:'0.5rem', color:'var(--text-muted)'}}>{label.toUpperCase()}</h4><div style={{flex:1, width:'100%'}}><Line data={data} options={options} /></div></div>;
    };

const ProgressCard = React.memo(({ label, current, goal, unit, selectedDate, allLogs, units }: any) => {
    if (label === 'Weight') {
        const yesterday = new Date(selectedDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const yesterdayWeight = parseFloat(allLogs[yesterdayStr]?.weight) || 0;
        const currentWeight = parseFloat(current) || 0;

        let diffText = 'Starting Weight';
        let diffColor = 'var(--text-muted)';
        let arrow = '—';

        if (yesterdayWeight > 0 && currentWeight > 0) {
            const diff = currentWeight - yesterdayWeight;
            diffText = diff > 0 ? `+${diff.toFixed(1)}${unit}` : `${diff.toFixed(1)}${unit}`;
            diffColor = diff > 0 ? '#ef4444' : '#10b981';
            arrow = diff > 0 ? '↑' : (diff < 0 ? '↓' : '—');
            if (diff === 0) diffText = 'No Change';
        }

        return (
            <div className="insight-card" style={{padding:'1.5rem', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <h4 style={{fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'1rem'}}>
                    WEIGHT TREND
                    <div className="tooltip-container">
                        <div className="info-btn">i</div>
                        <div className="tooltip-text">{yesterdayWeight > 0 ? "Comparing to yesterday." : "Starting progress."}</div>
                    </div>
                </h4>
                <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                    <span style={{fontSize:'1.5rem', fontWeight:800, color:diffColor}}>{arrow}</span>
                    <div style={{fontSize:'1.8rem', fontWeight:800, color:diffColor}}>{diffText}</div>
                </div>
                <div style={{fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.5rem'}}>Current: {currentWeight || '0'}{unit}</div>
            </div>
        );
    }

    const safeGoal = goal || 1;
    const percent = Math.round((current / safeGoal) * 100) || 0;
    
    // Contextual Coloring: 
    // For Calories, >100% is Red (Warning). 
    // For Water/Exercise/Sleep, >100% is Green (Success).
    let color = '#ef4444'; // Default Red
    if (label === 'Calories') {
        color = percent > 100 ? '#ef4444' : (percent > 85 ? '#f59e0b' : '#10b981');
    } else {
        color = percent >= 100 ? '#10b981' : (percent >= 50 ? '#f59e0b' : '#ef4444');
    }

    const r = 35; 
    const circ = 2 * Math.PI * r;
    // Cap the visual circle at 100% but keep the text percentage real
    const visualPercent = Math.min(percent, 100);
    const offset = circ - (visualPercent / 100) * circ;

    return (
        <div className="insight-card" style={{padding:'1.5rem', display:'flex', flexDirection:'column', alignItems:'center', border: percent > 100 && label === 'Calories' ? '2px solid rgba(239, 68, 68, 0.2)' : 'none'}}>
            <h4 style={{fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'1rem'}}>{label.toUpperCase()}</h4>
            <div style={{position:'relative', width:'80px', height:'80px'}}>
                <svg width="80" height="80" style={{transform:'rotate(-90deg)'}}>
                    <circle cx="40" cy="40" r={r} stroke="#e2e8f0" strokeWidth="6" fill="transparent" />
                    <circle 
                        cx="40" 
                        cy="40" 
                        r={r} 
                        stroke={color} 
                        strokeWidth="6" 
                        fill="transparent" 
                        strokeDasharray={circ} 
                        strokeDashoffset={offset} 
                        strokeLinecap="round" 
                        style={{transition:'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease'}} 
                    />
                </svg>
                <div style={{position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', fontWeight:800, fontSize:'1.1rem', color}}>{percent}%</div>
            </div>
            <div style={{marginTop:'0.8rem', fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:600}}>{current}{unit} / {goal}{unit}</div>
        </div>
    );
});

    const metrics = [
        { label: 'Water', current: dailyData.water, goal: goals.water, unit: 'L' },
        { label: 'Calories', current: dailyData.calories, goal: goals.calories, unit: 'kcal' },
        { label: 'Exercise', current: dailyData.exercise, goal: goals.exercise, unit: 'min' },
        { label: 'Sleep', current: dailyData.sleep, goal: goals.sleep, unit: 'hr' },
        { label: 'Weight', current: dailyData.weight, goal: goals.weight, unit: units === 'metric' ? 'kg' : 'lb' }
    ];

    const allGoalsHit = metrics.every(m => {
        const currentVal = typeof m.current === 'string' ? parseFloat(m.current) || 0 : m.current;
        return m.label === 'Weight' ? currentVal > 0 : currentVal >= m.goal;
    });
    const isToday = selectedDate === todayStr;
    const displayDateName = isToday ? 'Today' : new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });


    return (
        <div className="dashboard-main">
            <header style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem', padding:'1rem 0'}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'center', flexWrap:'wrap', gap:'1rem', width:'100%'}}>
                    <h1 className="weightless-float" style={{fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: 800, margin: 0}}>HealthFlow</h1>
                    <div className="date-picker-container" style={{background:'white', padding:'0.5rem 1rem', borderRadius:'14px', border:'1px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', gap:'0.5rem', boxShadow:'0 4px 10px rgba(0,0,0,0.03)'}}>
                        <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)} style={{border:'none', background:'none', padding:0, fontSize:'0.9rem', fontWeight:600, width:'130px', color:'var(--text-main)'}} />
                    </div>
                </div>
            </header>

            <div className="dashboard-container">
                <div className="tabs">
                    {['journal', 'daily-progress', 'achievements', 'insights', 'ai-recipes', 'goals'].map(tab => (
                        <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                            {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
                        </button>
                    ))}
                </div>

                <div className="content-area">
                    {activeTab === 'journal' && (
                        <div key="journal-tab" className="tab-content">
                            <div style={{background:'var(--accent-glow)', padding:'1.5rem', borderRadius:'22px', border:'1px solid var(--accent-color)', marginBottom:'2rem', animation:'fadeIn 0.8s ease-out'}}>
                                <span style={{fontSize:'0.7rem', fontWeight:800, color:'var(--accent-color)', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:'0.5rem'}}>Daily Inspiration</span>
                                <p style={{fontSize:'1.1rem', fontWeight:600, color:'var(--text-main)', fontStyle:'italic', margin:0}}>
                                    "The only bad workout is the one that didn't happen. Every small step counts toward your big vision."
                                </p>
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap:'1rem', marginBottom:'2rem'}}>
                                <h2 style={{fontSize:'2.5rem', fontWeight:800, color:'var(--text-main)'}}>{displayDateName}</h2>
                                {!isToday && <span style={{background:'rgba(99, 102, 241, 0.1)', color:'var(--accent-color)', padding:'6px 12px', borderRadius:'20px', fontSize:'0.7rem', fontWeight:700, border:'1px solid var(--accent-color)'}}>Viewing Past Entry</span>}
                            </div>

                            <div style={{background:'rgba(99, 102, 241, 0.05)', padding:'2rem', borderRadius:'28px', border:'1px solid var(--accent-glow)', marginBottom:'2.5rem', textAlign:'center'}}>
                                <label style={{fontSize:'0.8rem', fontWeight:800, color:'var(--accent-color)', marginBottom:'1rem', display:'block'}}>CURRENT WEIGHT ({units === 'metric' ? 'kg' : 'lb'})</label>
                                <input 
                                    type="number" 
                                    step="0.1" 
                                    value={dailyData.weight} 
                                    onChange={e => setDailyData({...dailyData, weight: e.target.value})} 
                                    placeholder="00.0"
                                    style={{fontSize:'3.5rem', fontWeight:800, background:'none', border:'none', textAlign:'center', width:'100%', color:'var(--text-main)', outline:'none'}}
                                />
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Water (Litres)</label>
                                    <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                        <button onClick={() => updateMetric('water', Math.max(0, (dailyData.water || 0) - 0.25))} style={{width:'45px', height:'45px', borderRadius:'12px', border:'none', background:'white', fontSize:'1.2rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 10px rgba(0,0,0,0.05)'}}>−</button>
                                        <input type="number" value={dailyData.water || ''} onChange={e => updateMetric('water', parseFloat(e.target.value) || 0)} style={{textAlign:'center', fontWeight:700}} />
                                        <button onClick={() => updateMetric('water', (dailyData.water || 0) + 0.25)} style={{width:'45px', height:'45px', borderRadius:'12px', border:'none', background:'var(--accent-color)', color:'white', fontSize:'1.2rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 15px var(--accent-glow)'}}>+</button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Exercise (Minutes)</label>
                                    <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                        <button onClick={() => updateMetric('exercise', Math.max(0, (dailyData.exercise || 0) - 15))} style={{width:'45px', height:'45px', borderRadius:'12px', border:'none', background:'white', fontSize:'1.2rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 10px rgba(0,0,0,0.05)'}}>−</button>
                                        <input type="number" value={dailyData.exercise || ''} onChange={e => updateMetric('exercise', parseInt(e.target.value) || 0)} style={{textAlign:'center', fontWeight:700}} />
                                        <button onClick={() => updateMetric('exercise', (dailyData.exercise || 0) + 15)} style={{width:'45px', height:'45px', borderRadius:'12px', border:'none', background:'var(--accent-color)', color:'white', fontSize:'1.2rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 15px var(--accent-glow)'}}>+</button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group" style={{gridColumn: 'span 2'}}>
                                    <label>Sleep (Hours)</label>
                                    <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                        <button onClick={() => updateMetric('sleep', Math.max(0, (dailyData.sleep || 0) - 0.5))} style={{width:'45px', height:'45px', borderRadius:'12px', border:'none', background:'white', fontSize:'1.2rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 10px rgba(0,0,0,0.05)'}}>−</button>
                                        <input type="number" value={dailyData.sleep || ''} onChange={e => updateMetric('sleep', parseFloat(e.target.value) || 0)} style={{textAlign:'center', fontWeight:700}} />
                                        <button onClick={() => updateMetric('sleep', (dailyData.sleep || 0) + 0.5)} style={{width:'45px', height:'45px', borderRadius:'12px', border:'none', background:'var(--accent-color)', color:'white', fontSize:'1.2rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 15px var(--accent-glow)'}}>+</button>
                                    </div>
                                </div>
                            </div>

                            <hr style={{margin:'2.5rem 0', opacity:0.1}} />

                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem'}}>
                                <h3 style={{fontSize:'1.2rem', fontWeight:700}}>Food Diary</h3>
                                <button className="tab-btn" style={{fontSize:'0.7rem', background: isManualMode ? 'var(--accent-color)' : 'white', color: isManualMode ? 'white' : 'var(--text-muted)'}} onClick={() => setIsManualMode(!isManualMode)}>{isManualMode ? '← Search Database' : '+ Manual Entry'}</button>
                            </div>
                            {!isManualMode ? (
                                <>
                                    <div className="form-group">
                                        <label>Search Food</label>
                                        <div style={{display:'flex', gap:'0.5rem'}}>
                                            <input 
                                                type="text" 
                                                value={foodQuery} 
                                                onChange={e => setFoodQuery(e.target.value)} 
                                                onKeyDown={e => e.key === 'Enter' && handleFoodSearch()}
                                                placeholder="e.g. Chicken Breast" 
                                                style={{flex: 1}}
                                            />
                                            <button 
                                                onClick={handleFoodSearch} 
                                                disabled={isSearching}
                                                style={{
                                                    padding: '0 1.5rem',
                                                    background: 'var(--accent-color)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '18px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    opacity: isSearching ? 0.6 : 1
                                                }}
                                            >
                                                {isSearching ? '...' : '🔍'}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {apiStatus === 'searching' && <div style={{textAlign:'center', padding:'1rem', fontSize:'0.8rem', color:'var(--accent-color)'}}>Searching global databases... 🕵️‍♂️</div>}
                                    {apiStatus === 'error' && <div style={{textAlign:'center', padding:'1rem', fontSize:'0.8rem', color:'#ef4444', background:'rgba(239, 68, 68, 0.05)', borderRadius:'12px'}}>⚠️ Connection Error: Could not reach search server.</div>}
                                    {apiStatus === 'no-results' && <div style={{textAlign:'center', padding:'1rem', fontSize:'0.8rem', color:'var(--text-muted)'}}>No results found. Try "Apple" or "Egg".</div>}
                                    
                                    <div className="grid-2">
                                        <div className="form-group">
                                            <label>Qty</label>
                                            <input type="number" value={foodQty} onChange={e => {setFoodQty(e.target.value); calculateStats(selectedFood, e.target.value, foodUnit);}} />
                                        </div>
                                        <div className="form-group">
                                            <label>Unit</label>
                                            <select value={foodUnit} onChange={e => {setFoodUnit(e.target.value); calculateStats(selectedFood, foodQty, e.target.value);}}>
                                                <option value="g">Grams (g)</option>
                                                <option value="piece">Piece(s) / Serving</option>
                                                <option value="ml">Milliliters (ml)</option>
                                                <option value="l">Litres (L)</option>
                                                <option value="oz">Ounces (oz)</option>
                                                <option value="lb">Pounds (lb)</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    {suggestions.length > 0 && (
                                        <div style={{background:'rgba(0,0,0,0.03)', borderRadius:'16px', padding:'0.5rem', marginBottom:'1.5rem', maxHeight:'200px', overflowY:'auto', border:'1px solid rgba(0,0,0,0.05)'}}>
                                            {suggestions.map((s, i) => (
                                                <div key={i} onClick={() => { setSelectedFood(s); calculateStats(s, foodQty, foodUnit); setSuggestions([]); }} style={{padding:'0.8rem', cursor:'pointer', borderBottom:'1px solid rgba(0,0,0,0.05)', fontSize:'0.9rem', background: selectedFood?.id === s.id ? 'var(--accent-glow)' : 'transparent', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                                    <div>
                                                        <strong>{s.name}</strong> <br/>
                                                        <span style={{fontSize:'0.7rem', color:'var(--text-muted)'}}>{s.brand} • {s.kcal} kcal</span>
                                                    </div>
                                                    <span style={{fontSize:'0.6rem', fontWeight:800, padding:'2px 6px', borderRadius:'6px', background:'rgba(0,0,0,0.05)', color:'var(--text-muted)'}}>{s.source}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {calculatedKcal > 0 && <div className="calculated-box" style={{fontSize:'2rem', fontWeight:800, color:'var(--accent-color)'}}>{calculatedKcal} kcal</div>}
                                    <button className="submit-btn" style={{marginTop:'1rem'}} onClick={() => { if (calculatedKcal > 0) handleAddFoodToTotal(calculatedKcal); alert('Food added!'); }}>Add to {isToday ? 'Today' : 'Journal'}</button>
                                </>
                            ) : (
                                <div style={{background:'rgba(0,0,0,0.02)', padding:'1.5rem', borderRadius:'24px'}}>
                                    <div className="form-group"><label>Manual Calories</label><input type="number" value={manualKcal} onChange={e => setManualKcal(e.target.value)} placeholder="0" /></div>
                                    <button className="submit-btn" onClick={() => { handleAddFoodToTotal(parseInt(manualKcal) || 0); setIsManualMode(false); setManualKcal(''); }}>Quick Add</button>
                                </div>
                            )}

                            <div style={{marginTop:'2rem', background: 'rgba(99, 102, 241, 0.05)', padding:'1.5rem', borderRadius:'16px', border:'1px dashed var(--accent-color)'}}>
                                <label style={{color: 'var(--accent-color)', fontWeight: 700}}>TOTAL CALORIES RECORDED</label>
                                <div style={{fontSize:'2.5rem', fontWeight:800}}>{dailyData.calories.toLocaleString()} <span style={{fontSize:'1rem', fontWeight:400}}>kcal</span></div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'daily-progress' && (
                        <div key="progress-tab" className="tab-content">
                            {allGoalsHit && <div style={{background:'var(--accent-color)', color:'white', padding:'1rem', borderRadius:'16px', textAlign:'center', marginBottom:'2rem', fontWeight:700}}>✨ Goal reached for {displayDateName}! 🚀</div>}
                            <div className="insight-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))'}}>{metrics.map(m => <ProgressCard key={m.label} {...m} selectedDate={selectedDate} allLogs={allLogs} units={units} />)}</div>
                        </div>
                    )}

                    {activeTab === 'achievements' && (
                        <div key="achievements-tab" className="tab-content">
                            <h2 style={{fontSize:'2rem', fontWeight:800, marginBottom:'1.5rem'}}>Your Achievements</h2>
                            <div className="insight-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))'}}>
                                    {
                                        [
                                            { id: 'water', label: 'H2O Hero', goal: goals.water, current: dailyData.water, icon: '💧', desc: `Target: ${goals.water}L daily` },
                                            { id: 'calories', label: 'Calorie Master', goal: goals.calories, current: dailyData.calories, icon: '🎯', desc: `Target: Under ${goals.calories}kcal` },
                                            { id: 'exercise', label: 'Iron Heart', goal: goals.exercise, current: dailyData.exercise, icon: '🔥', desc: `Target: ${goals.exercise}min daily` },
                                            { id: 'sleep', label: 'Sleep King', goal: goals.sleep, current: dailyData.sleep, icon: '🌙', desc: `Target: ${goals.sleep}hr daily` }
                                        ].map(badge => {
                                            const stats = calculateStreaks(badge.id, badge.goal, badge.id === 'calories');
                                            const isAchieved = stats.current > 0;
                                            return (
                                                <div key={badge.id} className="insight-card" style={{
                                                    textAlign:'center', 
                                                    opacity: isAchieved ? 1 : 0.3, 
                                                    transform: isAchieved ? 'scale(1.05)' : 'scale(1)',
                                                    border: isAchieved ? '2px solid var(--accent-color)' : '1px solid rgba(0,0,0,0.05)',
                                                    background: isAchieved ? 'var(--accent-glow)' : 'white',
                                                    transition: 'all 0.3s ease'
                                                }}>
                                                    <div style={{fontSize:'3rem', marginBottom:'1rem'}}>{badge.icon}</div>
                                                    <h4 style={{fontWeight:800, color: isAchieved ? 'var(--accent-color)' : 'var(--text-muted)'}}>{badge.label}</h4>
                                                    <p style={{fontSize:'0.65rem', color:'var(--text-muted)', marginTop:'0.4rem'}}>{badge.desc}</p>
                                                    <div style={{marginTop:'1rem', background:'rgba(0,0,0,0.03)', padding:'0.5rem', borderRadius:'10px'}}>
                                                        <div style={{fontSize:'0.6rem', color:'var(--text-muted)', textTransform:'uppercase', fontWeight:800}}>Current Streak</div>
                                                        <div style={{fontSize:'1.2rem', fontWeight:800, color: isAchieved ? 'var(--accent-color)' : 'var(--text-muted)'}}>{stats.current} Days</div>
                                                        <div style={{fontSize:'0.6rem', color:'var(--text-muted)', marginTop:'0.4rem'}}>Best Record: {stats.best} Days</div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                            </div>
                        </div>
                    )}

                    {activeTab === 'insights' && (
                        <div key="insights-tab" className="tab-content" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'1.5rem'}}>
                            {renderMiniChart('Weight', 'weight', goals.weight, units === 'metric' ? 'kg' : 'lb')}
                            {renderMiniChart('Water', 'water', goals.water, 'L')}
                            {renderMiniChart('Calories', 'calories', goals.calories, 'kcal')}
                            {renderMiniChart('Exercise', 'exercise', goals.exercise, 'min')}
                            {renderMiniChart('Sleep', 'sleep', goals.sleep, 'hr')}
                        </div>
                    )}

                    {activeTab === 'ai-recipes' && (
                        <div key="ai-tab" className="tab-content ai-recipes-container">
                            <h2 style={{fontSize:'2rem', fontWeight:800, marginBottom:'1.5rem'}}>AI Recipe Generator</h2>
                            <div className="form-group">
                                <label>What are you craving?</label>
                                <input type="text" value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)} placeholder="e.g. Lemon Garlic Butter Salmon" />
                            </div>
                            <div className="form-group">
                                <label>Dietary Preferences or Ingredients on Hand</label>
                                <textarea value={recipePrefs} onChange={e => setRecipePrefs(e.target.value)} placeholder="e.g. Keto, no dairy..." style={{minHeight:'100px'}} />
                            </div>
                            <button className="submit-btn" style={{fontSize:'1.1rem'}} onClick={handleGenerateRecipe} disabled={isGenerating}>
                                {isGenerating ? 'Chef is cooking... 👨‍🍳' : 'Search ✨'}
                            </button>

                            {recipeResult && (
                                <div className="insight-card" style={{marginTop:'2rem', background:'white', borderRadius:'24px', padding:'2rem'}}>
                                    <h3 style={{fontSize:'1.8rem', fontWeight:800, marginBottom:'0.5rem'}}>{recipeResult.title}</h3>
                                    <p style={{color:'var(--text-muted)', marginBottom:'1.5rem'}}>{recipeResult.description}</p>
                                    <div style={{background:'rgba(99, 102, 241, 0.05)', padding:'1rem', borderRadius:'16px', marginBottom:'1.5rem'}}>
                                        <strong>Est. Calories: {recipeResult.calories} kcal</strong>
                                    </div>
                                    <div style={{marginBottom:'1.5rem'}}>
                                        <h4 style={{fontWeight:700, marginBottom:'0.5rem'}}>Ingredients</h4>
                                        <ul style={{paddingLeft:'1.5rem'}}>{recipeResult.ingredients.map((i: string, idx: number) => <li key={idx}>{i}</li>)}</ul>
                                    </div>
                                    <div>
                                        <h4 style={{fontWeight:700, marginBottom:'0.5rem'}}>Instructions</h4>
                                        <ol style={{paddingLeft:'1.5rem'}}>{recipeResult.instructions.map((i: string, idx: number) => <li key={idx} style={{marginBottom:'0.5rem'}}>{i}</li>)}</ol>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'goals' && (
                        <div key="goals-tab" className="tab-content">
                            <div className="form-group"><label>Target Weight</label><input type="number" value={goals.weight} onChange={e => setGoals({...goals, weight: parseFloat(e.target.value)})} /></div>
                            <div className="grid-2"><div className="form-group"><label>Water Goal (L)</label><input type="number" value={goals.water} onChange={e => setGoals({...goals, water: parseFloat(e.target.value)})} /></div><div className="form-group"><label>Calorie Limit</label><input type="number" value={goals.calories} onChange={e => setGoals({...goals, calories: parseInt(e.target.value)})} /></div></div>
                            <div className="grid-2"><div className="form-group"><label>Exercise Goal (Min)</label><input type="number" value={goals.exercise} onChange={e => setGoals({...goals, exercise: parseInt(e.target.value)})} /></div><div className="form-group"><label>Sleep Goal (Hr)</label><input type="number" value={goals.sleep} onChange={e => setGoals({...goals, sleep: parseFloat(e.target.value)})} /></div></div>
                            <button className="submit-btn" onClick={() => alert("Goals updated!")}>Update Goals</button>
                        </div>
                    )}
                </div>
            </div>

            <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
            <Clock />

            {showSettings && (
                <div className="modal-overlay" onClick={() => setShowSettings(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <button style={{float:'right', background:'none', border:'none', fontSize:'1.5rem'}} onClick={() => setShowSettings(false)}>×</button>
                        <h2>Settings</h2>
                        <div className="theme-grid">
                            {[
                                { name: 'Indigo', class: '', color: '#6366f1' }, 
                                { name: 'Ocean', class: 'theme-ocean', color: '#0d9488' }, 
                                { name: 'Sunset', class: 'theme-sunset', color: '#e11d48' }, 
                                { name: 'Forest', class: 'theme-forest', color: '#059669' }, 
                                { name: 'Slate', class: 'theme-midnight', color: '#475569' }, 
                                { name: 'Sakura', class: 'theme-sakura', color: '#db2777' },
                                { name: 'Lavender', class: 'theme-lavender', color: '#8b5cf6' },
                                { name: 'Aurora', class: 'theme-aurora', color: '#d946ef' },
                                { name: 'Solar', class: 'theme-solar', color: '#f59e0b' },
                                { name: 'Frost', class: 'theme-frost', color: '#06b6d4' },
                                { name: 'Vulcan', class: 'theme-vulcan', color: '#991b1b' },
                                { name: 'Spring', class: 'theme-spring', color: '#10b981' }
                            ].map(t => (
                                <div key={t.name} className={`theme-option ${theme === t.class ? 'active' : ''}`} onClick={() => setTheme(t.class)} title={t.name} style={{ background: t.color }}></div>
                            ))}
                        </div>
                        <hr style={{margin:'1.5rem 0', opacity:0.1}} />
                        <div className="form-group">
                            <label>Gemini API Key</label>
                            <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="Paste your key here..." />
                        </div>
                        <hr style={{margin:'1.5rem 0', opacity:0.1}} />
                        <div className="toggle-group">
                            <button className={`toggle-btn ${units === 'metric' ? 'active' : ''}`} onClick={() => setUnits('metric')}>Metric</button>
                            <button className={`toggle-btn ${units === 'imperial' ? 'active' : ''}`} onClick={() => setUnits('imperial')}>Imperial</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
