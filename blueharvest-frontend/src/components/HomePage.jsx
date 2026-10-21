import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  User, 
  Image as ImageIcon, 
  Camera, 
  Video, 
  ChevronRight, 
  Settings, 
  BarChart3, 
  Sprout, 
  Home, 
  FileText, 
  BarChart2, 
  X, 
  CheckCircle2, 
  RefreshCw,
  LogOut,
  Sliders,
  Check,
  Search,
  Filter,
  ChevronDown,
  MoreVertical,
  Ruler,
  Layers,
  Box,
  Maximize2,
  Download,
  Trash2,
  Eye,
  SlidersHorizontal,
  SwitchCamera,
  MapPin,
  FileDown,
  Save,
  ArrowRight,
  RotateCcw,
  Mail,
  Phone,
  Globe,
  Palette,
  Pencil,
  Briefcase
} from 'lucide-react';
import heroImage from '../assets/hero.png';
import agriImage from '../assets/agriculture.png';
import trayImage from '../assets/tray.png';
import insightsBg from '../assets/insightsBg.png';
import outputCountBg from '../assets/outputCountBg.png';
import outputCardMainBg from '../assets/outputCardMainBg.png';
import DualFishLoader, { DualFishSpinner } from './DualFishLoader';
import { getApiBaseUrl, processImage, listCountSessions, createCountSession, saveCountSession, deleteCountSession, getDashboardSummary, getDemoStatus, getUserSettings, updateProfile, updateUserSettings, getNotifications, markNotificationRead } from '../api/client';
import { applyTheme, setupSystemThemeListener, THEME_STORAGE_KEY } from '../utils/theme';

// Authentic Fish icon matching insightsReference.png
const FishIcon = ({ size = 20, color = "#1D70F7" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <path d="M2.5 12C5.5 8 11.5 7 16.5 9.8L21.5 6.5V17.5L16.5 14.2C11.5 17 5.5 16 2.5 12Z" />
    <circle cx="6.5" cy="11.2" r="1.3" fill="#FFFFFF" />
  </svg>
);

// Authentic Counting Sessions stacked discs icon matching insightsReference.png
const CountingSessionsIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <ellipse cx="12" cy="6.5" rx="7.5" ry="2.8" fill="#10B981" />
    <path d="M4.5 10.5C4.5 12 7.8 13.3 12 13.3C16.2 13.3 19.5 12 19.5 10.5" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M4.5 15.5C4.5 17 7.8 18.3 12 18.3C16.2 18.3 19.5 17 19.5 15.5" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

// Authentic blue circular basin / tank tub icon matching historySectionReference.png
const BasinIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <ellipse cx="12" cy="7.5" rx="8.5" ry="3.5" fill="#3B82F6" />
    <path d="M3.5 7.5v7.2c0 2.2 3.8 3.8 8.5 3.8s8.5-1.6 8.5-3.8V7.5" fill="#2563EB" />
    <ellipse cx="12" cy="7.5" rx="6.8" ry="2.2" fill="#93C5FD" />
  </svg>
);

// Indian Rupee currency icon
const IndianRupeeIcon = ({ size = 13, color = "currentColor" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2.4" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ flexShrink: 0 }}
  >
    <path d="M6 3h12" />
    <path d="M6 8h12" />
    <path d="M6 13l8.5 8" />
    <path d="M6 13h3a4.5 4.5 0 0 0 0-9" />
  </svg>
);

// Spawn batch price calculation: single spawn price = 0.025 INR, flat packing cost = 50 INR
const calculateBatchPrice = (count) => {
  const num = Number(count);
  if (!Number.isFinite(num) || num < 0) return 50.0;
  return (num * 0.025) + 50.0;
};

const formatPriceINR = (count) => {
  const price = calculateBatchPrice(count);
  return '₹' + price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};



// Format processing latency in seconds
const formatProcessingTime = (timeStr) => {
  if (timeStr === null || timeStr === undefined || timeStr === '') return 'Not available';
  const value = String(timeStr).trim();
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*(ms|milliseconds|s|sec|seconds)?$/i);
  if (!match) return value;
  const number = Number(match[1]);
  const unit = (match[2] || '').toLowerCase();
  if (!Number.isFinite(number) || number < 0) return 'Not available';
  
  let seconds;
  if (unit === 'ms' || unit === 'milliseconds') {
    seconds = number / 1000;
  } else if (unit === 's' || unit === 'sec' || unit === 'seconds') {
    seconds = number;
  } else {
    // If no unit provided, values >= 20 are assumed to be milliseconds
    seconds = number >= 20 ? number / 1000 : number;
  }
  
  return `${seconds.toFixed(2)}s`;
};

const formatSessionTime = (value) => {
  if (!value) return 'Time not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const clock = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay(date, today)) return `Today, ${clock}`;
  if (sameDay(date, yesterday)) return `Yesterday, ${clock}`;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const mapSessionToHistoryItem = (item) => {
  const timestamp = item.created_at || item.time;
  const date = timestamp ? new Date(timestamp) : null;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a && !Number.isNaN(a.getTime()) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const group = sameDay(date, today) ? 'Today' : sameDay(date, yesterday) ? 'Yesterday' : 'Earlier';

  let resolvedImage = item.image || item.image_path || item.image_url || null;
  if (!resolvedImage && typeof window !== 'undefined') {
    try {
      resolvedImage = sessionStorage.getItem(`bh_img_${item.id}`) || sessionStorage.getItem(`bh_img_${item.session_id}`) || localStorage.getItem(`bh_img_${item.id}`) || null;
    } catch { /* storage optional */ }
  }
  if (resolvedImage && resolvedImage.startsWith('/')) {
    resolvedImage = `${getApiBaseUrl()}${resolvedImage}`;
  }

  const countNum = item.count ?? 0;
  const priceValue = calculateBatchPrice(countNum);
  const priceFormatted = formatPriceINR(countNum);

  return {
    id: item.id,
    sessionId: item.session_id,
    isDemo: Boolean(item.is_demo),
    group,
    time: formatSessionTime(timestamp),
    count: countNum,
    price: priceValue,
    priceFormatted: priceFormatted,
    pond: item.pond || 'Location not recorded',
    source: item.source || 'Uploaded',
    container: item.container || 'Not recorded',
    dimensions: item.dimensions || 'Not recorded',
    image: resolvedImage,
    confidence: item.confidence || 'Not measured',
    avgLength: item.avgLength || 'Not measured',
    status: item.status || 'Saved',
    method: item.method || 'Method not recorded',
  };
};

// Celebration Checkmark Badge matching outputCardReference.png
const CelebrationCheckmarkBadge = () => (
  <div className="celebration-badge-container">
    <svg width="112" height="112" viewBox="0 0 112 112" fill="none" xmlns="http://www.w3.org/2000/svg" className="celebration-burst-svg">
      {/* Radiating Accent Ticks */}
      <line x1="43" y1="23" x2="39" y2="15" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="69" y1="23" x2="73" y2="15" stroke="#60A5FA" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="89" y1="56" x2="97" y2="56" stroke="#60A5FA" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="81" y1="78" x2="87" y2="84" stroke="#60A5FA" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="31" y1="78" x2="25" y2="84" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="23" y1="56" x2="15" y2="56" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" />

      {/* Floating Accent Dots */}
      <circle cx="27" cy="38" r="2.2" fill="#10B981" />
      <circle cx="56" cy="11" r="2.2" fill="#10B981" />
      <circle cx="85" cy="38" r="2.2" fill="#10B981" />
      <circle cx="94" cy="69" r="2.2" fill="#38BDF8" />
      <circle cx="25" cy="69" r="2.2" fill="#10B981" />
      <circle cx="56" cy="100" r="2" fill="#60A5FA" />

      {/* Soft Outer Halo Ring */}
      <circle cx="56" cy="56" r="37" fill="rgba(220, 252, 231, 0.45)" />

      {/* Solid Inner Badge */}
      <circle cx="56" cy="56" r="29" fill="#DCFCE7" stroke="#FFFFFF" strokeWidth="2.2" />

      {/* Bold Green Checkmark */}
      <path 
        d="M45.5 56.5L52.5 63.5L66.5 49" 
        stroke="#16A34A" 
        strokeWidth="3.8" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  </div>
);

// Solid left-facing fish silhouette matching outputCardReference.png
const OutputCardFishIcon = ({ size = 26, color = "#1D4ED8" }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M4 14C6.5 11.2 10.2 9.5 14.5 9.5C16.8 9.5 18.8 8.2 19.8 7C20.2 8.5 20.5 10.2 20.5 12C21.8 11 23.5 9.8 25.5 9L24.2 14L25.5 19C23.5 18.2 21.8 17 20.5 16C20.5 17.8 20.2 19.5 19.8 21C18.8 19.8 16.8 18.5 14.5 18.5C10.2 18.5 6.5 16.8 4 14Z" 
      fill={color} 
    />
    <circle cx="8.5" cy="13.2" r="1.3" fill="#FFFFFF" />
  </svg>
);

// Decorative wavy underline matching outputCardReference.png
const OutputWaveSquiggle = () => (
  <svg width="72" height="6" viewBox="0 0 72 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="output-stat-wave">
    <path 
      d="M1 3C5 1 9 5 13 3C17 1 21 5 25 3C29 1 33 5 37 3C41 1 45 5 49 3C53 1 57 5 61 3C65 1 69 5 71 3" 
      stroke="#93C5FD" 
      strokeWidth="2" 
      strokeLinecap="round" 
    />
  </svg>
);

export default function HomePage({ 
  user, 
  onLogout, 
  activeTab: propTab = 'home', 
  onTabChange, 
  onCountRequested, 
  autoTriggerCount 
}) {
  const [internalTab, setInternalTab] = useState(propTab || 'home');
  const activeTab = propTab || internalTab;

  const handleTabChange = (tabName) => {
    setInternalTab(tabName);
    if (onTabChange) {
      onTabChange(tabName);
    }
  };

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [scanningImage, setScanningImage] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showHeatmapLightbox, setShowHeatmapLightbox] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // Profile settings state matching profileSectionReference.png
  const [profileLocation, setProfileLocation] = useState(user?.pondLocation || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [profileRole, setProfileRole] = useState(user?.role || 'Aquafarm Operator');
  const [profileUsername, setProfileUsername] = useState(user?.username || '');
  const [profileNotificationsEnabled, setProfileNotificationsEnabled] = useState(true);
  const [profileLanguage, setProfileLanguage] = useState('English');
  const [profileTheme, setProfileTheme] = useState(() => (
    typeof window !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) || 'Light (Default)' : 'Light (Default)'
  ));
  const [profileToast, setProfileToast] = useState(null);

  // Modals for profile actions
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showLocationPickerModal, setShowLocationPickerModal] = useState(false);
  const [showLanguagePickerModal, setShowLanguagePickerModal] = useState(false);
  const [showThemePickerModal, setShowThemePickerModal] = useState(false);

  // Profile Form Edit draft state
  const [editFormData, setEditFormData] = useState({
    username: user?.username || '',
    role: user?.role || 'Aquafarm Operator',
    email: user?.email || '',
    phone: user?.phone || '',
    location: user?.pondLocation || ''
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync and listen to active theme changes (including OS system preference)
  useEffect(() => {
    applyTheme(profileTheme);
    const cleanup = setupSystemThemeListener(() => profileTheme);
    return cleanup;
  }, [profileTheme]);

  const showProfileToastMsg = (msg) => {
    setProfileToast(msg);
    setTimeout(() => {
      setProfileToast(null);
    }, 2400);
  };

  // Live Camera Scanner State
  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [currentScanSource, setCurrentScanSource] = useState('Uploaded');

  // Farm Insights are calculated from saved backend ledger records, not hard-coded metrics.
  const [activeInsightsRange, setActiveInsightsRange] = useState('Today');
  const [insightsData, setInsightsData] = useState({ totalFish: 0, sessions: 0, locations: [] });
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [isSavingCount, setIsSavingCount] = useState(false);

  const handleDownloadPDFReport = () => {
    if (insightsError) {
      showProfileToastMsg('Cannot generate the report because analytics could not be loaded.');
      return;
    }
    const current = insightsData;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>BlueHarvest - Farm Insights Report (${activeInsightsRange})</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0C182A; background: #FFFFFF; }
            .header { border-bottom: 2px solid #2563EB; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
            h1 { margin: 0; color: #1D70F7; font-size: 26px; }
            .subtitle { color: #64748B; margin: 4px 0 0; }
            .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .stat-box { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px; border-radius: 12px; }
            .stat-num { font-size: 32px; font-weight: 800; color: #0C182A; margin: 6px 0; }
            .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .table th, .table td { text-align: left; padding: 12px; border-bottom: 1px solid #E2E8F0; }
            .table th { background: #EFF6FF; color: #1D70F7; }
            .footer { margin-top: 40px; font-size: 12px; color: #94A3B8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>BlueHarvest — Farm Insights Report</h1>
              <p class="subtitle">Time Range: ${activeInsightsRange} • Exported: ${new Date().toLocaleDateString()}</p>
            </div>
            <div>
              <strong>${user?.pondLocation || 'Location not recorded'}</strong>
            </div>
          </div>
          <div class="stats-grid">
            <div class="stat-box">
              <div style="color: #64748B; font-size: 14px;">Total Fish Counted</div>
              <div class="stat-num">${current.totalFish.toLocaleString()}</div>
              <div style="color: #64748B; font-weight: 600;">Saved count records</div>
            </div>
            <div class="stat-box">
              <div style="color: #64748B; font-size: 14px;">Counting Sessions</div>
              <div class="stat-num">${current.sessions}</div>
              <div style="color: #64748B;">Saved count sessions in selected date range</div>
            </div>
          </div>
          <h3>Counts by Location Breakdown</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Location Area</th>
                <th>Total Spawn</th>
                <th>Share of Harvest</th>
              </tr>
            </thead>
            <tbody>
              ${current.locations.map(l => `
                <tr>
                  <td><strong>${l.name}</strong></td>
                  <td>${l.count.toLocaleString()} fry</td>
                  <td>${l.percentage}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            BlueHarvest AI • Ledger summary
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // Trigger file dialog if autoTriggerCount is present (e.g. direct /count or /pipeline navigation)
  useEffect(() => {
    if (autoTriggerCount) {
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [autoTriggerCount]);

  // Notifications are user-scoped backend records; do not display invented alerts.
  const [notifications, setNotifications] = useState([]);

  // Load records from the user's database-backed ledger; no sample rows are silently treated as live data.
  const [historyItems, setHistoryItems] = useState([]);

  // History search, filtering, and modal interaction state
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);
  const [selectedBatchModal, setSelectedBatchModal] = useState(null);
  const [showBatchAnalysis, setShowBatchAnalysis] = useState(false);

  // Load demo-mode status, profile preferences, notification records, ledger and analytics.
  useEffect(() => {
    let alive = true;
    getDemoStatus().then((status) => { if (alive) setDemoModeEnabled(Boolean(status.enabled)); })
      .catch(() => { if (alive) setDemoModeEnabled(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    getUserSettings().then((settings) => {
      if (!alive) return;
      setProfileNotificationsEnabled(Boolean(settings.notificationsEnabled));
      setProfileLanguage(settings.language || 'English');
      const themeVal = settings.theme || localStorage.getItem(THEME_STORAGE_KEY) || 'Light (Default)';
      setProfileTheme(themeVal);
      localStorage.setItem(THEME_STORAGE_KEY, themeVal);
      applyTheme(themeVal);
    }).catch(() => {});
    getNotifications().then((items) => {
      if (alive) setNotifications(items.map((item) => ({
        id: item.id,
        title: item.title,
        desc: item.description,
        time: formatSessionTime(item.created_at),
        read: Boolean(item.read_at),
      })));
    }).catch(() => { if (alive) setNotifications([]); });
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    setHistoryLoading(true);
    setHistoryError('');
    listCountSessions({ includeDemo: demoModeEnabled, includeUnsaved: true })
      .then((items) => { if (alive) setHistoryItems(items.map(mapSessionToHistoryItem)); })
      .catch((error) => { if (alive) { setHistoryItems([]); setHistoryError(error.message || 'Could not load the saved ledger.'); } })
      .finally(() => { if (alive) setHistoryLoading(false); });
    return () => { alive = false; };
  }, [user?.id, activeTab, demoModeEnabled]);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const ranges = {
      'Today': 'today',
      'This Week': 'this_week',
      'This Month': 'this_month',
      'All Time': 'all_time',
      '7 Days': '7_days',
      '30 Days': '30_days',
    };
    setInsightsLoading(true);
    setInsightsError('');
    getDashboardSummary(ranges[activeInsightsRange] || 'today', demoModeEnabled)
      .then((data) => {
        if (!alive) return;
        const total = Number(data.total_fish || 0);
        const palette = ['#3B82F6', '#10B981', '#F59E0B', '#A855F7', '#06B6D4'];
        setInsightsData({
          totalFish: total,
          sessions: Number(data.sessions || 0),
          locations: (data.locations || []).map((location, index) => ({
            name: location.name,
            count: Number(location.count || 0),
            percentage: total > 0 ? Math.round(Number(location.count || 0) / total * 100) : 0,
            color: palette[index % palette.length],
          })),
        });
      })
      .catch((error) => {
        if (alive) {
          setInsightsData({ totalFish: 0, sessions: 0, locations: [] });
          setInsightsError(error.message || 'Could not load analytics from the backend.');
        }
      })
      .finally(() => { if (alive) setInsightsLoading(false); });
    return () => { alive = false; };
  }, [user?.id, activeInsightsRange, demoModeEnabled]);

  useEffect(() => {
    if (!user?.id) return;
    setProfileLocation(user.pondLocation || '');
    setProfileEmail(user.email || '');
    setProfilePhone(user.phone || '');
    setProfileRole(user.role || 'Aquafarm Operator');
    setProfileUsername(user.username || '');
    setEditFormData({ username: user.username || '', role: user.role || 'Aquafarm Operator', email: user.email || '', phone: user.phone || '', location: user.pondLocation || '' });
  }, [user?.id]);

  // Close dropdowns on outside interaction
  useEffect(() => {
    const handleGlobalClick = () => {
      setShowFilterDropdown(false);
      setActiveActionMenuId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Live Camera Stream Controller
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowLiveCamera(false);
    setCameraError(null);
  };

  const startCamera = async (facing = cameraFacingMode) => {
    setIsCameraStarting(true);
    setCameraError(null);

    // Stop existing stream first if active
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Live camera streaming is not supported on this browser or environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Live video auto-play interrupted:', playErr);
        }
      }
    } catch (err) {
      console.error('Camera stream error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. Please allow camera permissions in your browser to scan fish fry live.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera device was detected on your hardware.');
      } else {
        setCameraError(err.message || 'Unable to start camera stream. Please try again or choose an image file.');
      }
    } finally {
      setIsCameraStarting(false);
    }
  };

  const handleSwitchCamera = () => {
    const nextFacing = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  const handleCaptureLivePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    if (w === 0 || h === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `live-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopCamera();
        processSelectedFile(file, 'Camera');
      }
    }, 'image/jpeg', 0.95);
  };

  // Sync stream lifecycle when live camera modal opens/closes
  useEffect(() => {
    if (showLiveCamera) {
      startCamera(cameraFacingMode);
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [showLiveCamera]);

  // Unified File / Camera Stream Image Processing. Display only values actually returned by the backend.
  const processSelectedFile = async (file, source = 'Uploaded') => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setScanningImage(url);
    setIsAnalyzing(true);
    setScanResult(null);
    setScanError(null);
    setCurrentScanSource(source);

    try {
      const data = await processImage(file);
      const rawCount = data.final_fish_count ?? data.final_count;
      const count = Number(rawCount);
      if (rawCount === undefined || rawCount === null || !Number.isFinite(count) || count < 0) {
        throw new Error('The backend did not return a valid fish count. No result was saved.');
      }

      const stats = data.stats || {};
      const processingTime = stats.processing_time_ms !== null && stats.processing_time_ms !== undefined && Number.isFinite(Number(stats.processing_time_ms))
        ? `${(Number(stats.processing_time_ms) / 1000).toFixed(2)}s`
        : null;
      const rawConfidence = data.confidence ?? stats.confidence ?? stats.confidence_score ?? null;
      const confidence = typeof rawConfidence === 'number' && rawConfidence >= 0 && rawConfidence <= 1
        ? `${(rawConfidence * 100).toFixed(1)}%`
        : rawConfidence === null ? null : String(rawConfidence);
      const rawAvgLength = data.avg_length_mm ?? stats.avg_length_mm ?? null;
      const avgLength = Number.isFinite(Number(rawAvgLength)) && rawAvgLength !== null
        ? `${Number(rawAvgLength)} mm`
        : null;
      const density = data.density_label ?? stats.density_label ?? null;
      const channel = stats.selected_channel_name ?? data.method ?? null;

      setScanResult({
        count,
        confidence,
        density,
        avgLength,
        processingTime,
        processingTimeMs: stats.processing_time_ms !== null && stats.processing_time_ms !== undefined && Number.isFinite(Number(stats.processing_time_ms)) ? Number(stats.processing_time_ms) : null,
        confidenceValue: typeof rawConfidence === 'number' && rawConfidence >= 0 && rawConfidence <= 1 ? rawConfidence : null,
        avgLengthMm: Number.isFinite(Number(rawAvgLength)) && rawAvgLength !== null ? Number(rawAvgLength) : null,
        channel,
        heatmapImg: data.final_heatmap || data.heatmap || data.components || null,
        image: data.image_url || data.image_path || url,
        rawResponse: data,
      });
    } catch (err) {
      console.error('BlueHarvest backend image-processing error:', err);
      setScanError(err.message || 'Image processing failed. Check that the local FastAPI backend is running.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImageSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      processSelectedFile(file, 'Uploaded');
    }
  };

  const handleSaveToLedger = async () => {
    if (!scanResult || !Number.isFinite(Number(scanResult.count))) return;
    setIsSavingCount(true);
    setScanError(null);
    try {
      const imageToSave = scanResult.image || scanningImage || null;
      const created = await createCountSession({
        count: Number(scanResult.count),
        source: currentScanSource || 'Uploaded',
        container: null,
        dimensions: null,
        pondLocation: user?.pondLocation || profileLocation || null,
        density: typeof scanResult.density === 'string' ? scanResult.density : null,
        confidence: scanResult.confidenceValue,
        avgLengthMm: scanResult.avgLengthMm,
        processingTimeMs: scanResult.processingTimeMs,
        method: scanResult.channel || null,
        image: imageToSave,
        isDemo: false,
      });
      if (imageToSave) {
        try {
          sessionStorage.setItem(`bh_img_${created.id}`, imageToSave);
          sessionStorage.setItem(`bh_img_${created.session_id}`, imageToSave);
        } catch { /* storage optional */ }
      }
      await saveCountSession(created.session_id, true);
      const rows = await listCountSessions({ includeDemo: demoModeEnabled, includeUnsaved: true });
      setHistoryItems(rows.map(mapSessionToHistoryItem));
      setScanResult(null);
      showProfileToastMsg('Count saved to the Hatchery Ledger');
    } catch (error) {
      setScanError(error.message || 'Could not save this count to the Hatchery Ledger.');
    } finally {
      setIsSavingCount(false);
    }
  };

  const handleExportCSV = (batch, e) => {
    e?.stopPropagation();
    const countNum = Number(batch.count) || 0;
    const priceFormatted = formatPriceINR(countNum);
    const surv1to4 = Math.max(0, Math.round(countNum * 0.98));
    const surv12to24 = Math.max(0, Math.round(countNum * 0.90));
    const survPond = Math.max(0, Math.round(countNum * 0.30));

    const csvContent = "data:text/csv;charset=utf-8," + 
      "Batch ID,Date & Time,Spawn Count,Price,Surviving (1-4h Transit - 2% Mort),Surviving (12-24h Transit - 10% Mort),Surviving (Pond Stocking - 70% Mort),Pond Location,Record Type\n" +
      `"${batch.id}","${batch.time}","${countNum}","${priceFormatted}","${surv1to4}","${surv12to24}","${survPond}","${batch.pond}","Saved count record"\n`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${batch.id}-ledger.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setActiveActionMenuId(null);
  };

  const handleDeleteBatch = async (id, e) => {
    e?.stopPropagation();
    const row = historyItems.find((item) => item.id === id);
    try {
      await deleteCountSession(row?.sessionId || id);
      setHistoryItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      setHistoryError(error.message || 'Could not delete this record.');
    }
    setActiveActionMenuId(null);
  };

  // Filter & Search processing
  const filteredHistoryItems = historyItems.filter((item) => {
    const q = historySearchQuery.trim().toLowerCase();
    const matchesSearch = !q || (
      item.id.toLowerCase().includes(q) ||
      item.pond.toLowerCase().includes(q) ||
      item.time.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q) ||
      (item.priceFormatted || '').toLowerCase().includes(q) ||
      item.container.toLowerCase().includes(q) ||
      item.source.toLowerCase().includes(q)
    );

    let matchesFilter = true;
    if (activeFilter !== 'All') {
      if (activeFilter === 'Tray' || activeFilter === 'Tank' || activeFilter === 'Pond') {
        matchesFilter = (item.container || '').toLowerCase() === activeFilter.toLowerCase();
      } else if (activeFilter === 'Camera' || activeFilter === 'Uploaded') {
        matchesFilter = (item.source || '').toLowerCase() === activeFilter.toLowerCase();
      }
    }

    return matchesSearch && matchesFilter;
  });

  // Group items by time period
  const groupedHistory = filteredHistoryItems.reduce((acc, item) => {
    const groupName = item.group || 'Today';
    if (!acc[groupName]) {
      acc[groupName] = [];
    }
    acc[groupName].push(item);
    return acc;
  }, {});

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const activeGroups = groupOrder.filter((group) => groupedHistory[group]?.length > 0);

  return (
    <div className={`home-screen-wrapper tab-${activeTab}`}>
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        accept="image/*" 
        style={{ display: 'none' }}
        onChange={handleImageSelected} 
      />

      {/* Main Scrollable Content */}
      <div className="home-scroll-container">
        {/* Top Header Bar */}
        <header className="home-header">
          <div className="home-brand">
            <div className="home-logo-circle" aria-label="Blue Harvest Logo">
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <path d="M4.5 14C7 8.5 14 7 19.5 10.5L25 7V21L19.5 17.5C14 21 7 19.5 4.5 14Z" fill="#FFFFFF"/>
                <circle cx="9" cy="13" r="1.5" fill="#2563EB"/>
              </svg>
            </div>
            <span className="home-brand-title">Blue Harvest</span>
          </div>

          <div className="home-header-actions">
            <button 
              type="button" 
              className="icon-action-btn notif-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
            >
              <Bell size={19} strokeWidth={2.2} className="header-action-icon" />
              <span className="notif-red-dot"></span>
            </button>

            <button 
              type="button" 
              className="icon-action-btn avatar-btn"
              onClick={() => setShowProfileModal(true)}
              aria-label="User Profile"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="#3B82F6">
                <path d="M12 12c2.4 0 4.4-2 4.4-4.4S14.4 3.2 12 3.2 7.6 5.2 7.6 7.6 9.6 12 12 12zm0 2.4c-3 0-9 1.5-9 4.4v2h18v-2c0-2.9-6-4.4-9-4.4z"/>
              </svg>
            </button>
          </div>
        </header>

        {activeTab === 'home' && (
          <>
            {/* Hero Section with Tub Image Blend */}
            <section className="home-hero-section">
              <div className="hero-content-wrapper">
                <div className="hero-text-content">
                  <h1 className="hero-heading">
                    Count Fish<br />
                    Spawn <span className="highlight-blue">Easily</span>
                  </h1>
                  <p className="hero-subtext">
                    Upload a photo or use your camera to get an accurate count of fish spawn and fry.
                  </p>
                </div>

                {/* Top-Right Circular Basin with Spawn from hero.png */}
                <div className="hero-image-wrapper" aria-label="Fish fry swimming in nursery basin">
                  <img 
                    src={heroImage} 
                    alt="Count fish spawn in blue basin" 
                    className="hero-tub-img" 
                  />
                  <div className="hero-image-blend-overlay"></div>
                </div>
              </div>

              {/* Authentic animated dual-layer wave ribbons matching heroReference.png */}
              <div className="hero-wave-divider" aria-hidden="true">
                {/* Wave Layer 1: Upper Light Blue Ribbon (#BCD3FD) */}
                <svg viewBox="0 0 820 100" preserveAspectRatio="none" className="home-wave-layer home-wave-1">
                  <path 
                    d="M-60,46 C50,16 250,16 410,44 C530,65 670,68 820,36 C845,30 865,34 885,38 L885,100 L-60,100 Z" 
                    fill="#BCD3FD"
                  />
                </svg>
                {/* Wave Layer 2: Lower Soft Blue Ribbon (#97B9FC) */}
                <svg viewBox="0 0 820 100" preserveAspectRatio="none" className="home-wave-layer home-wave-2">
                  <path 
                    d="M-60,76 C50,56 250,56 410,74 C530,85 670,80 820,52 C845,46 865,52 885,58 L885,100 L-60,100 Z" 
                    fill="#97B9FC"
                  />
                </svg>
                {/* Wave Layer 3: Deep Blue Right Corner Accent (#1E6FFB) */}
                <svg viewBox="0 0 820 100" preserveAspectRatio="none" className="home-wave-layer home-wave-3">
                  <path 
                    d="M710,100 C745,96 785,82 820,68 C845,60 865,65 885,70 L885,100 Z" 
                    fill="#1E6FFB"
                  />
                </svg>
              </div>
            </section>

            {/* Primary Action Cards Grid (Responsive 2-col on mobile, 3-col on tablet/desktop) */}
            <section className="action-cards-grid">
              {/* Upload Image Card */}
              <div 
                className="action-card upload-card"
                onClick={() => {
                  fileInputRef.current && fileInputRef.current.click();
                }}
                role="button"
                tabIndex={0}
              >
                <div className="card-top-row">
                  <div className="card-icon-badge blue-badge">
                    <ImageIcon size={24} className="card-icon" />
                  </div>
                  <ChevronRight size={20} className="card-chevron blue-chevron" />
                </div>
                <div className="card-text-block">
                  <h2 className="card-title">Upload Image</h2>
                  <p className="card-subtitle">From gallery or files</p>
                </div>
              </div>

              {/* Use Camera Card - Opens Live Camera Scanner */}
              <div 
                className="action-card camera-card"
                onClick={() => {
                  setShowLiveCamera(true);
                }}
                role="button"
                tabIndex={0}
                aria-label="Open live camera scanner"
              >
                <div className="card-top-row">
                  <div className="card-icon-badge green-badge">
                    <Camera size={24} className="card-icon" />
                  </div>
                  <ChevronRight size={20} className="card-chevron green-chevron" />
                </div>
                <div className="card-text-block">
                  <h2 className="card-title">Live Camera</h2>
                  <p className="card-subtitle">Open live camera</p>
                </div>
              </div>

              {/* Video Counting Card */}
              <div className="action-card video-card">
                <div className="video-card-left">
                  <div className="card-icon-badge amber-badge">
                    <Video size={24} className="card-icon" />
                  </div>
                  <div className="video-text-block">
                    <h2 className="card-title">Video Counting</h2>
                    <span className="coming-soon-tag">Coming Soon</span>
                  </div>
                </div>
                <ChevronRight size={20} className="card-chevron gray-chevron" />
              </div>
            </section>

            {/* How It Works Section */}
            <section className="how-it-works-section">
              <h2 className="section-title">How It Works</h2>
              
              <div className="steps-flow-container">
                {/* Step 1 */}
                <div className="step-flow-item">
                  <div className="step-circle-wrapper">
                    <span className="step-counter-badge">1</span>
                    <div className="step-icon-circle">
                      <ImageIcon size={26} className="step-icon" />
                    </div>
                  </div>
                  <h3 className="step-title">Upload or Capture</h3>
                  <p className="step-desc">Open live camera or choose an image</p>
                </div>

                {/* Connecting Arrow */}
                <div className="step-arrow-divider" aria-hidden="true">
                  <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
                    <path d="M1 8H24M24 8L18 2M24 8L18 14" stroke="#93C5FD" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Step 2 */}
                <div className="step-flow-item">
                  <div className="step-circle-wrapper">
                    <span className="step-counter-badge">2</span>
                    <div className="step-icon-circle">
                      <Settings size={26} className="step-icon" />
                    </div>
                  </div>
                  <h3 className="step-title">AI Processing</h3>
                  <p className="step-desc">Our system analyzes the image</p>
                </div>

                {/* Connecting Arrow */}
                <div className="step-arrow-divider" aria-hidden="true">
                  <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
                    <path d="M1 8H24M24 8L18 2M24 8L18 14" stroke="#93C5FD" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Step 3 */}
                <div className="step-flow-item">
                  <div className="step-circle-wrapper">
                    <span className="step-counter-badge">3</span>
                    <div className="step-icon-circle">
                      <BarChart3 size={26} className="step-icon" />
                    </div>
                  </div>
                  <h3 className="step-title">Get Count</h3>
                  <p className="step-desc">View the approximated spawn count</p>
                </div>
              </div>
            </section>

            {/* Supporting Sustainable Aquaculture Banner */}
            <section className="sustainability-banner">
              <div className="banner-content">
                <div className="banner-sprout-badge">
                  <Sprout size={24} className="sprout-icon" />
                </div>
                <div className="banner-text">
                  <h3 className="banner-heading">Supporting Sustainable Aquaculture</h3>
                  <p className="banner-subtext">For healthier farms and brighter tomorrows.</p>
                </div>
              </div>

              {/* Landscape Illustration Artwork from Assets */}
              <div className="banner-artwork" aria-hidden="true">
                <img 
                  src={agriImage} 
                  alt="Sustainable Aquaculture Landscape" 
                  className="banner-artwork-img" 
                />
              </div>
            </section>
          </>
        )}

        {/* History Tab View matching historySectionReference.png */}
        {activeTab === 'history' && (
          <div className="history-tab-view-container">
            {/* History Top Hero with agriculture.png Artwork */}
            <section className="history-hero-section">
              <div className="history-hero-art-wrapper" aria-hidden="true">
                <img 
                  src={agriImage} 
                  alt="Sustainable Aquaculture Landscape" 
                  className="history-hero-art-img" 
                />
                <div className="history-hero-overlay" />
              </div>

              <div className="history-hero-content">
                <h1 className="history-hero-heading">Counting History</h1>
                <p className="history-hero-subtext">View all your past fish counts</p>
              </div>
            </section>

            {/* Dedicated Search & Filter Controls (Below hero image with zero overlap, 15% smaller) */}
            <div className="history-search-filter-section">
              <div className="history-controls-row">
                <div className="history-search-box">
                  <Search size={15} className="history-search-icon" />
                  <input 
                    type="text" 
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Search by pond name, date or ID..." 
                    className="history-search-input"
                    aria-label="Search past fish counts"
                  />
                  {historySearchQuery && (
                    <button 
                      type="button" 
                      className="history-search-clear"
                      onClick={() => setHistorySearchQuery('')}
                      aria-label="Clear search query"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="history-filter-wrapper" onClick={(e) => e.stopPropagation()}>
                  <button 
                    type="button" 
                    className={`history-filter-btn ${activeFilter !== 'All' ? 'active' : ''}`}
                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                    aria-label="Filter counting batches"
                  >
                    <Filter size={14} strokeWidth={2.3} />
                    <span>{activeFilter === 'All' ? 'Filters' : activeFilter}</span>
                    <ChevronDown size={13} className={`filter-chevron ${showFilterDropdown ? 'rotated' : ''}`} />
                  </button>

                  {showFilterDropdown && (
                    <div className="history-filter-dropdown">
                        <div className="filter-dropdown-header">Filter by Type</div>
                        <button 
                          type="button" 
                          className={`filter-option-btn ${activeFilter === 'All' ? 'selected' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveFilter('All'); 
                            setShowFilterDropdown(false); 
                          }}
                        >
                          <span>All Records</span>
                          {activeFilter === 'All' && <Check size={14} className="filter-opt-check" />}
                        </button>
                        <div className="filter-dropdown-divider" />
                        <div className="filter-dropdown-section-lbl">Containers</div>
                        <button 
                          type="button" 
                          className={`filter-option-btn ${activeFilter === 'Tray' ? 'selected' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveFilter('Tray'); 
                            setShowFilterDropdown(false); 
                          }}
                        >
                          <div className="option-with-icon"><Layers size={14} /><span>Nursery Tray</span></div>
                          {activeFilter === 'Tray' && <Check size={14} className="filter-opt-check" />}
                        </button>
                        <button 
                          type="button" 
                          className={`filter-option-btn ${activeFilter === 'Tank' ? 'selected' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveFilter('Tank'); 
                            setShowFilterDropdown(false); 
                          }}
                        >
                          <div className="option-with-icon"><Box size={14} /><span>Spawn Tank</span></div>
                          {activeFilter === 'Tank' && <Check size={14} className="filter-opt-check" />}
                        </button>
                        <button 
                          type="button" 
                          className={`filter-option-btn ${activeFilter === 'Pond' ? 'selected' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveFilter('Pond'); 
                            setShowFilterDropdown(false); 
                          }}
                        >
                          <div className="option-with-icon"><BasinIcon size={14} /><span>Main Pond</span></div>
                          {activeFilter === 'Pond' && <Check size={14} className="filter-opt-check" />}
                        </button>
                        <div className="filter-dropdown-divider" />
                        <div className="filter-dropdown-section-lbl">Source</div>
                        <button 
                          type="button" 
                          className={`filter-option-btn ${activeFilter === 'Camera' ? 'selected' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveFilter('Camera'); 
                            setShowFilterDropdown(false); 
                          }}
                        >
                          <div className="option-with-icon"><Camera size={14} /><span>Camera</span></div>
                          {activeFilter === 'Camera' && <Check size={14} className="filter-opt-check" />}
                        </button>
                        <button 
                          type="button" 
                          className={`filter-option-btn ${activeFilter === 'Uploaded' ? 'selected' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActiveFilter('Uploaded'); 
                            setShowFilterDropdown(false); 
                          }}
                        >
                          <div className="option-with-icon"><ImageIcon size={14} /><span>Uploaded</span></div>
                          {activeFilter === 'Uploaded' && <Check size={14} className="filter-opt-check" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            {/* History Feed List with Time Groups */}
            <section className="history-feed-section">
              {historyLoading ? <p className="modal-description">Loading saved ledger records…</p> : null}
              {historyError ? <p className="field-error-message" role="alert">{historyError}</p> : null}
              {!historyLoading && !historyError && historyItems.length === 0 ? <p className="modal-description">No saved count records yet. Completed counts will appear here after they are saved.</p> : null}
              {activeGroups.length > 0 ? (
                activeGroups.map((groupName) => (
                  <div key={groupName} className="history-group-block">
                    <h2 className="history-group-header">{groupName}</h2>
                    <div className="history-cards-list">
                      {groupedHistory[groupName].map((item) => (
                        <div 
                          key={item.id} 
                          className="history-card-item"
                          onClick={() => setSelectedBatchModal(item)}
                          role="button"
                          tabIndex={0}
                        >
                          {/* Left Square Thumbnail */}
                          <div className="history-thumb-box">
                            <img 
                              src={item.image || heroImage} 
                              alt={`Fish count ${item.id}`} 
                              className="history-thumb-img" 
                            />
                          </div>

                          {/* Right Details Column */}
                          <div className="history-card-right">
                            {/* Card Top Row: ID, Time, More Options */}
                            <div className="history-card-top-row">
                              <span className="history-batch-code">{item.id}</span>
                              <div className="history-card-time-group">
                                <span className="history-timestamp">{item.time}</span>
                                <div className="history-more-wrapper" onClick={(e) => e.stopPropagation()}>
                                  <button 
                                    type="button" 
                                    className="history-more-btn"
                                    onClick={() => setActiveActionMenuId(activeActionMenuId === item.id ? null : item.id)}
                                    aria-label="More options"
                                  >
                                    <MoreVertical size={16} />
                                  </button>

                                  {activeActionMenuId === item.id && (
                                    <div className="history-card-menu-dropdown">
                                      <button 
                                        type="button" 
                                        className="card-menu-action-btn"
                                        onClick={() => {
                                          setSelectedBatchModal(item);
                                          setActiveActionMenuId(null);
                                        }}
                                      >
                                        <Eye size={14} />
                                        <span>View Details</span>
                                      </button>
                                      <button 
                                        type="button" 
                                        className="card-menu-action-btn"
                                        onClick={(e) => handleExportCSV(item, e)}
                                      >
                                        <Download size={14} />
                                        <span>Download CSV</span>
                                      </button>
                                      <button 
                                        type="button" 
                                        className="card-menu-action-btn delete-btn"
                                        onClick={(e) => handleDeleteBatch(item.id, e)}
                                      >
                                        <Trash2 size={14} />
                                        <span>Delete Record</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Card Middle Row: Count Box + Pond & Density Column */}
                            <div className="history-card-mid-row">
                              <div className="history-count-badge-box">
                                <span className="history-count-num">
                                  {Number(item.count).toLocaleString()}
                                </span>
                                <span className="history-count-lbl">Spawn</span>
                              </div>

                              <div className="history-pond-density-col">
                                <div className="history-pond-chip-row">
                                  <BasinIcon size={17} />
                                  <span className="history-pond-title">{item.pond}</span>
                                </div>
                                <div className="history-density-chip" title="Price: ₹0.025/spawn + ₹50 packing">
                                  <IndianRupeeIcon size={13} />
                                  <span>Price: {item.priceFormatted || formatPriceINR(item.count)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Bottom Tags Row */}
                            <div className="history-tags-row">
                              <div className="history-tag-pill">
                                {item.source === 'Camera' ? <Camera size={12} /> : <ImageIcon size={12} />}
                                <span>{item.source}</span>
                              </div>
                              <div className="history-tag-pill">
                                {item.container === 'Tray' ? <Layers size={12} /> : item.container === 'Tank' ? <Box size={12} /> : <ImageIcon size={12} />}
                                <span>{item.container}</span>
                              </div>
                              <div className="history-tag-pill">
                                <Ruler size={12} />
                                <span>{item.dimensions}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="history-empty-state">
                  <div className="empty-state-icon-box">
                    <Search size={32} />
                  </div>
                  <h3 className="empty-state-title">No matching counts found</h3>
                  <p className="empty-state-desc">
                    {historySearchQuery 
                      ? `We couldn't find any batches matching "${historySearchQuery}".`
                      : `No batches found for filter "${activeFilter}".`}
                  </p>
                  <button 
                    type="button" 
                    className="empty-reset-btn"
                    onClick={() => {
                      setHistorySearchQuery('');
                      setActiveFilter('All');
                    }}
                  >
                    Reset Search & Filters
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Farm Insights Tab View matching insightsReference.png */}
        {(activeTab === 'insights' || activeTab === 'reports') && (
          <div className="insights-tab-view-container">
            {/* Top Hero with insightsBg.png Artwork */}
            <section className="insights-hero-section">
              <div className="insights-hero-art-wrapper" aria-hidden="true">
                <img 
                  src={insightsBg} 
                  alt="Aquaculture farm landscape with pond and mountains" 
                  className="insights-hero-art-img" 
                />
                <div className="insights-hero-overlay" />
              </div>

              <div className="insights-hero-content">
                <h1 className="insights-hero-heading">Farm Insights</h1>
                <p className="insights-hero-subtext">
                  See how many fish you have counted and where they were counted.
                </p>
              </div>
            </section>

            {/* Time Filter Pills: Today, This Week, This Month, All Time */}
            <div className="insights-filter-pills-row">
              {['Today', 'This Week', 'This Month', 'All Time'].map((period) => (
                <button
                  key={period}
                  type="button"
                  className={`insights-filter-pill ${activeInsightsRange === period ? 'active' : ''}`}
                  onClick={() => setActiveInsightsRange(period)}
                >
                  {period}
                </button>
              ))}
            </div>

            {/* 2 Primary KPI Summary Cards matching insightsReference.png */}
            <div className="insights-kpi-cards-grid">
              {/* Total Fish Counted Card */}
              <div className="insights-kpi-card total-fish-card">
                <div className="insights-kpi-icon-badge blue-badge">
                  <FishIcon size={20} color="#1D70F7" />
                </div>
                <span className="insights-kpi-label">Total Fish Counted</span>
                <span className="insights-kpi-value">
                  {insightsLoading ? 'Loading…' : insightsError ? '—' : insightsData.totalFish.toLocaleString()}
                </span>
                <span className="insights-kpi-subtext">Fish Fry</span>
              </div>

              {/* Counting Sessions Card */}
              <div className="insights-kpi-card sessions-card">
                <div className="insights-kpi-icon-badge green-badge">
                  <CountingSessionsIcon size={22} />
                </div>
                <span className="insights-kpi-label">Counting Sessions</span>
                <span className="insights-kpi-value">
                  {insightsLoading ? '…' : insightsError ? '—' : insightsData.sessions}
                </span>
                <span className="insights-kpi-subtext">Sessions done</span>
              </div>
            </div>

            {insightsError && <p className="field-error-message" role="alert">{insightsError}</p>}

            {/* Counts by Location Card matching insightsReference.png */}
            <div className="insights-location-card">
              <div className="insights-location-header">
                <MapPin size={18} fill="#2563EB" stroke="#2563EB" className="location-pin-icon" />
                <h2 className="insights-location-title">Counts by Location</h2>
              </div>

              <div className="insights-location-list">
                {insightsData.locations.map((loc) => (
                  <div key={loc.name} className="insights-location-row">
                    <span className="insights-location-name">{loc.name}</span>
                    <div className="insights-progress-track">
                      <div 
                        className="insights-progress-fill" 
                        style={{ 
                          width: `${loc.percentage}%`,
                          backgroundColor: loc.color
                        }} 
                      />
                    </div>
                    <span className="insights-location-count">{loc.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download PDF Report CTA Button */}
            <button 
              type="button" 
              className="insights-download-btn"
              onClick={handleDownloadPDFReport}
              aria-label="Download PDF report of hatchery insights"
            >
              <FileDown size={20} className="download-btn-icon" />
              <span>Download PDF Report</span>
            </button>
          </div>
        )}

        {/* Profile Tab View matching profileSectionReference.png */}
        {activeTab === 'profile' && (
          <section className="profile-tab-content">
            {/* Top Heading Group */}
            <div className="profile-heading-group">
              <h1 className="profile-main-title">Profile</h1>
              <p className="profile-main-subtitle">Manage your farm details and account settings</p>
            </div>

            {/* Farm & Manager Hero Card */}
            <div className="profile-hero-card">
              {/* Subtle wavy decorative vector background on the right */}
              <div className="profile-hero-waves-bg" aria-hidden="true">
                <svg viewBox="0 0 280 160" fill="none" preserveAspectRatio="none">
                  <path d="M40 160C100 135 150 70 280 60V160H40Z" fill="url(#heroWaveGrad1)" />
                  <path d="M90 160C140 125 190 95 280 90V160H90Z" fill="url(#heroWaveGrad2)" />
                  <defs>
                    <linearGradient id="heroWaveGrad1" x1="40" y1="110" x2="280" y2="110" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#E2EDFD" stopOpacity="0.75" />
                      <stop stopColor="#CCE3FD" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="heroWaveGrad2" x1="90" y1="125" x2="280" y2="125" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#EDF4FE" stopOpacity="0.9" />
                      <stop stopColor="#DBEAFE" stopOpacity="0.75" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {/* Avatar & Manager Identity */}
              <div className="profile-hero-top-row">
                <div className="profile-hero-avatar-wrap">
                  <div className="profile-hero-avatar-circle">
                    <svg viewBox="0 0 24 24" fill="#3B82F6" className="profile-hero-avatar-svg">
                      <path d="M12 12c2.4 0 4.4-2 4.4-4.4S14.4 3.2 12 3.2 7.6 5.2 7.6 7.6 9.6 12 12 12zm0 2.4c-3 0-9 1.5-9 4.4v2h18v-2c0-2.9-6-4.4-9-4.4z"/>
                    </svg>
                  </div>
                  <button 
                    type="button" 
                    className="profile-avatar-edit-badge"
                    onClick={() => {
                      setEditFormData({
                        username: profileUsername,
                        role: profileRole,
                        email: profileEmail,
                        phone: profilePhone,
                        location: profileLocation
                      });
                      setShowEditProfileModal(true);
                    }}
                    aria-label="Edit Profile Details"
                  >
                    <Pencil size={11} strokeWidth={2.6} color="#FFFFFF" />
                  </button>
                </div>

                <div className="profile-hero-identity">
                  <h2 className="profile-hero-name">{profileUsername}</h2>
                  <span className="profile-hero-role">{profileRole}</span>
                </div>
              </div>

              {/* Farm Location Pill */}
              <div 
                className="profile-location-pill"
                role="button"
                tabIndex={0}
                onClick={() => setShowLocationPickerModal(true)}
                aria-label="Change Farm Location"
              >
                <div className="profile-location-left">
                  <div className="profile-location-icon-badge">
                    <MapPin size={17} fill="#2563EB" color="#2563EB" />
                  </div>
                  <div className="profile-location-text">
                    <span className="profile-location-label">Farm Location</span>
                    <strong className="profile-location-value">{profileLocation}</strong>
                  </div>
                </div>
                <ChevronRight size={18} className="profile-row-chevron" />
              </div>
            </div>

            {/* Account & Contact Card */}
            <div className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-icon-badge">
                  <User size={18} strokeWidth={2.4} color="#2563EB" />
                </div>
                <div className="profile-card-header-text">
                  <h3 className="profile-card-title">Account & Contact</h3>
                  <p className="profile-card-subtitle">Your account information</p>
                </div>
              </div>

              <div className="profile-card-items-list">
                <div 
                  className="profile-info-row-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEditFormData({
                      username: profileUsername,
                      role: profileRole,
                      email: profileEmail,
                      phone: profilePhone,
                      location: profileLocation
                    });
                    setShowEditProfileModal(true);
                  }}
                >
                  <div className="profile-row-left">
                    <Mail size={18} strokeWidth={2} className="profile-row-icon" />
                    <span className="profile-row-label">Email</span>
                  </div>
                  <div className="profile-row-right">
                    <span className="profile-row-value">{profileEmail}</span>
                    <ChevronRight size={16} className="profile-row-chevron" />
                  </div>
                </div>

                <div className="profile-row-divider" />

                <div 
                  className="profile-info-row-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEditFormData({
                      username: profileUsername,
                      role: profileRole,
                      email: profileEmail,
                      phone: profilePhone,
                      location: profileLocation
                    });
                    setShowEditProfileModal(true);
                  }}
                >
                  <div className="profile-row-left">
                    <Phone size={18} strokeWidth={2} className="profile-row-icon" />
                    <span className="profile-row-label">Phone Number</span>
                  </div>
                  <div className="profile-row-right">
                    <span className="profile-row-value">{profilePhone}</span>
                    <ChevronRight size={16} className="profile-row-chevron" />
                  </div>
                </div>
              </div>
            </div>

            {/* App Settings Card */}
            <div className="profile-section-card">
              <div className="profile-card-header">
                <div className="profile-card-icon-badge">
                  <Settings size={18} strokeWidth={2.4} color="#2563EB" />
                </div>
                <div className="profile-card-header-text">
                  <h3 className="profile-card-title">App Settings</h3>
                  <p className="profile-card-subtitle">Customize your experience</p>
                </div>
              </div>

              <div className="profile-card-items-list">
                <div 
                  className="profile-setting-row-item"
                  role="button"
                  tabIndex={0}
                  onClick={async () => {
                    const next = !profileNotificationsEnabled;
                    setProfileNotificationsEnabled(next);
                    try {
                      await updateUserSettings({ notificationsEnabled: next });
                      showProfileToastMsg(next ? 'Notifications enabled' : 'Notifications muted');
                    } catch (error) {
                      setProfileNotificationsEnabled(!next);
                      showProfileToastMsg(error.message || 'Could not save notification preference');
                    }
                  }}
                >
                  <div className="profile-row-left">
                    <Bell size={18} strokeWidth={2} className="profile-row-icon" />
                    <div className="profile-setting-text">
                      <span className="profile-setting-title">Notifications</span>
                      <span className="profile-setting-sub">
                        {profileNotificationsEnabled ? 'Receive updates and alerts' : 'Notifications muted'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="profile-row-chevron" />
                </div>

                <div className="profile-row-divider" />

                <div 
                  className="profile-setting-row-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowLanguagePickerModal(true)}
                >
                  <div className="profile-row-left">
                    <Globe size={18} strokeWidth={2} className="profile-row-icon" />
                    <div className="profile-setting-text">
                      <span className="profile-setting-title">Language</span>
                      <span className="profile-setting-sub">{profileLanguage}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="profile-row-chevron" />
                </div>

                <div className="profile-row-divider" />

                <div 
                  className="profile-setting-row-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowThemePickerModal(true)}
                >
                  <div className="profile-row-left">
                    <Palette size={18} strokeWidth={2} className="profile-row-icon" />
                    <div className="profile-setting-text">
                      <span className="profile-setting-title">App Theme</span>
                      <span className="profile-setting-sub">{profileTheme}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="profile-row-chevron" />
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
            <button 
              type="button" 
              className="profile-signout-btn"
              onClick={onLogout}
              aria-label="Sign Out"
            >
              <LogOut size={18} strokeWidth={2.4} className="profile-signout-icon" />
              <span>Sign Out</span>
            </button>
          </section>
        )}
      </div>

      {/* Fixed Bottom Navigation Bar */}
      <nav className="home-bottom-nav" role="navigation" aria-label="Bottom Navigation">
        <div className="nav-items-wrapper">
          <button 
            type="button" 
            className={`nav-tab-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleTabChange('home')}
          >
            <div className="nav-icon-container">
              <Home size={22} className="nav-svg-icon" />
            </div>
            <span className="nav-tab-label">Home</span>
          </button>

          <button 
            type="button" 
            className={`nav-tab-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => handleTabChange('history')}
          >
            <div className="nav-icon-container">
              <FileText size={22} className="nav-svg-icon" />
            </div>
            <span className="nav-tab-label">History</span>
          </button>

          <button 
            type="button" 
            className={`nav-tab-item ${(activeTab === 'insights' || activeTab === 'reports') ? 'active' : ''}`}
            onClick={() => handleTabChange('insights')}
          >
            <div className="nav-icon-container">
              <BarChart2 size={22} className="nav-svg-icon" />
            </div>
            <span className="nav-tab-label">Insights</span>
          </button>

          <button 
            type="button" 
            className={`nav-tab-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleTabChange('profile')}
          >
            <div className="nav-icon-container">
              <User size={22} className="nav-svg-icon" />
            </div>
            <span className="nav-tab-label">Profile</span>
          </button>
        </div>

        {/* iOS Home Indicator Bar */}
        <div className="home-indicator-pill-bar"></div>
      </nav>

      {/* Notifications Drawer */}
      {showNotifications && (
        <div className="modal-backdrop" onClick={() => setShowNotifications(false)}>
          <div className="notif-drawer-card" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-header-left">
                <div className="drawer-header-icon-badge">
                  <Bell size={18} color="#2563EB" />
                </div>
                <div>
                  <h3 className="drawer-title">Notifications</h3>
                  <p className="drawer-subtitle">System & batch scan alerts</p>
                </div>
              </div>
              <button 
                type="button" 
                className="drawer-close-btn"
                onClick={() => setShowNotifications(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="notif-list">
              {notifications.length === 0 ? <p className="modal-description">No notifications yet.</p> : notifications.map((n) => (
                <div
                  key={n.id}
                  className="notif-item"
                  role="button"
                  tabIndex={0}
                  onClick={async () => {
                    if (n.read) return;
                    try {
                      await markNotificationRead(n.id);
                      setNotifications((items) => items.map((item) => item.id === n.id ? { ...item, read: true } : item));
                    } catch (error) {
                      showProfileToastMsg(error.message || 'Could not update notification');
                    }
                  }}
                >
                  <div className="notif-badge">
                    <CheckCircle2 size={16} className="notif-check" />
                  </div>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.desc}</p>
                    <span className="notif-time">{n.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {showProfileModal && (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="modal-card profile-quick-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              type="button" 
              className="modal-close-btn"
              onClick={() => setShowProfileModal(false)}
            >
              <X size={18} />
            </button>
            <div className="profile-modal-avatar">
              <User size={30} className="header-action-icon" />
            </div>
            <h3 className="profile-modal-name">{user?.username || 'samarth_aquafarm'}</h3>
            <span className="profile-modal-role">{user?.role || 'Hatchery Operator'}</span>
            <div className="profile-modal-info">
              <div><strong>Pond:</strong> {user?.pondLocation || 'Pond Delta #4'}</div>
              <div><strong>Status:</strong> AI counting model ready</div>
            </div>
            <button 
              type="button" 
              className="action-btn logout-btn-modal"
              onClick={() => {
                setShowProfileModal(false);
                onLogout();
              }}
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Batch Detail Modal */}
      {selectedBatchModal && (
        <div className="modal-backdrop" onClick={() => setSelectedBatchModal(null)}>
          <div className="modal-card batch-detail-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="modal-header-info">
                <span className="batch-modal-id">{selectedBatchModal.id}</span>
                <span className="batch-modal-status-badge">
                  <CheckCircle2 size={13} /> {selectedBatchModal.status || 'Saved'}
                </span>
              </div>
              <button 
                type="button" 
                className="drawer-close-btn" 
                onClick={() => setSelectedBatchModal(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="batch-modal-image-wrapper">
              <img 
                src={selectedBatchModal.image || heroImage} 
                alt={selectedBatchModal.id} 
                className="batch-modal-img" 
                onError={(e) => { e.currentTarget.src = heroImage; }}
              />
            </div>

            <div className="batch-modal-count-row">
              <div className="batch-modal-count-stat">
                <span className="modal-count-num">{Number(selectedBatchModal.count).toLocaleString()}</span>
                <span className="modal-count-sub">Total Spawn</span>
              </div>
              <div className="batch-modal-density-stat">
                <span className="modal-density-val">{formatPriceINR(selectedBatchModal.count)}</span>
                <span className="modal-density-sub">Price</span>
              </div>
            </div>

            
              {/* Clean metadata grid focused on operational context */}
              <div className="modal-meta-row">
                <span className="meta-lbl">Price Breakdown</span>
                <span className="meta-val">₹0.025/spawn + ₹50 packing</span>
              </div>
              <div className="modal-meta-row">
                <span className="meta-lbl">Pond / Tank</span>
                <span className="meta-val">{selectedBatchModal.pond}</span>
              </div>
              <div className="modal-meta-row">
                <span className="meta-lbl">Captured</span>
                <span className="meta-val">{selectedBatchModal.time}</span>
              </div>
              <div className="modal-meta-row">
                <span className="meta-lbl">Vision Pipeline</span>
                <span className="meta-val">{selectedBatchModal.method || 'Method not recorded'}</span>
              </div>
            </div>

            {/* Analysis Section Trigger & Real Mortality Calculations */}
            <div className="batch-analysis-container">
              <button 
                type="button" 
                className={`batch-analysis-banner-btn ${showBatchAnalysis ? 'active' : ''}`}
                onClick={() => setShowBatchAnalysis(!showBatchAnalysis)}
                aria-expanded={showBatchAnalysis}
              >
                <div className="analysis-btn-content">
                  <BarChart3 size={17} className="analysis-btn-icon" />
                  <span className="analysis-btn-text">
                    {showBatchAnalysis ? 'Hide Mortality & Survival Analysis' : 'Mortality & Survival Analysis'}
                  </span>
                </div>
                <ChevronDown size={17} className={`analysis-btn-arrow ${showBatchAnalysis ? 'rotated' : ''}`} />
              </button>

              {showBatchAnalysis && (() => {
                const analysis = calculateMortalityAnalysis(selectedBatchModal.count);
                return (
                  <div className="batch-analysis-card">
                    <div className="analysis-card-header">
                      <span className="analysis-card-title">Real Mortality & Survival Estimates</span>
                      <span className="analysis-card-sub">Calculated from total spawn count: {Number(selectedBatchModal.count).toLocaleString()}</span>
                    </div>

                    <div className="analysis-scenarios-list">
                      {/* Scenario 1: 1 to 4 hr transportation */}
                      <div className="analysis-scenario-item transit-short">
                        <div className="scenario-top-row">
                          <span className="scenario-title">1 to 4 hr Transportation</span>
                          <span className="scenario-rate-badge rate-2">2% Mortality</span>
                        </div>
                        <div className="scenario-numbers-row">
                          <div className="scenario-stat-col stat-left">
                            <span className="scenario-stat-lbl">Estimated Loss</span>
                            <span className="scenario-loss-val text-red">-{analysis.t1to4.loss.toLocaleString()}</span>
                          </div>
                          <div className="scenario-arrow-col">→</div>
                          <div className="scenario-stat-col stat-right">
                            <span className="scenario-stat-lbl">Net Surviving Spawn</span>
                            <span className="scenario-surviving-val text-green">{analysis.t1to4.surviving.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="scenario-progress-track">
                          <div className="scenario-progress-bar bar-green" style={{ width: '98%' }} />
                        </div>
                      </div>

                      {/* Scenario 2: 12 to 24 hr transportation */}
                      <div className="analysis-scenario-item transit-long">
                        <div className="scenario-top-row">
                          <span className="scenario-title">12 to 24 hr Transportation</span>
                          <span className="scenario-rate-badge rate-10">10% Mortality</span>
                        </div>
                        <div className="scenario-numbers-row">
                          <div className="scenario-stat-col stat-left">
                            <span className="scenario-stat-lbl">Estimated Loss</span>
                            <span className="scenario-loss-val text-red">-{analysis.t12to24.loss.toLocaleString()}</span>
                          </div>
                          <div className="scenario-arrow-col">→</div>
                          <div className="scenario-stat-col stat-right">
                            <span className="scenario-stat-lbl">Net Surviving Spawn</span>
                            <span className="scenario-surviving-val text-blue">{analysis.t12to24.surviving.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="scenario-progress-track">
                          <div className="scenario-progress-bar bar-blue" style={{ width: '90%' }} />
                        </div>
                      </div>

                      {/* Scenario 3: After putting spawn in pond / fish */}
                      <div className="analysis-scenario-item pond-stocking">
                        <div className="scenario-top-row">
                          <span className="scenario-title">Pond Stocking (After Spawn)</span>
                          <span className="scenario-rate-badge rate-70">70% Mortality</span>
                        </div>
                        <div className="scenario-numbers-row">
                          <div className="scenario-stat-col stat-left">
                            <span className="scenario-stat-lbl">Estimated Loss</span>
                            <span className="scenario-loss-val text-red">-{analysis.pond70.loss.toLocaleString()}</span>
                          </div>
                          <div className="scenario-arrow-col">→</div>
                          <div className="scenario-stat-col stat-right">
                            <span className="scenario-stat-lbl">Net Surviving Spawn</span>
                            <span className="scenario-surviving-val text-amber">{analysis.pond70.surviving.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="scenario-progress-track">
                          <div className="scenario-progress-bar bar-amber" style={{ width: '30%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="batch-modal-actions-row">
              <button type="button" className="modal-analysis-btn"><BarChart3 size={16} /><span>Analysis</span></button> <button 
                type="button" 
                className="modal-csv-btn"
                onClick={(e) => handleExportCSV(selectedBatchModal, e)}
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
              <button 
                type="button" 
                className="modal-close-action-btn"
                onClick={() => { setSelectedBatchModal(null); setShowBatchAnalysis(false); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Scanner Viewfinder Modal */}
      {showLiveCamera && (
        <div className="modal-backdrop camera-live-backdrop" onClick={stopCamera}>
          <div className="camera-live-modal" onClick={(e) => e.stopPropagation()}>
            {/* Live Camera Top Bar */}
            <div className="camera-modal-header">
              <div className="camera-header-tag">
                <span className="live-rec-dot" />
                <span>LIVE CAMERA SCANNER</span>
              </div>
              <button 
                type="button" 
                className="camera-close-btn"
                onClick={stopCamera}
                aria-label="Close live camera"
              >
                <X size={20} />
              </button>
            </div>

            {/* Viewfinder Window */}
            <div className="camera-viewfinder-container">
              {cameraError ? (
                <div className="camera-error-view">
                  <div className="camera-error-icon">
                    <Camera size={34} />
                  </div>
                  <h4 className="camera-error-title">Camera Access Required</h4>
                  <p className="camera-error-desc">{cameraError}</p>
                  <div className="camera-error-actions">
                    <button 
                      type="button" 
                      className="action-btn primary-login-btn camera-retry-btn"
                      onClick={() => startCamera(cameraFacingMode)}
                    >
                      <RefreshCw size={15} />
                      <span>Try Again</span>
                    </button>
                    <button 
                      type="button" 
                      className="action-btn camera-fallback-file-btn"
                      onClick={stopCamera}
                    >
                      <span>Close Camera</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <video 
                    ref={videoRef} 
                    playsInline 
                    muted 
                    className="camera-video-feed" 
                  />

                  {isCameraStarting && (
                    <div className="camera-loading-overlay">
                      <DualFishSpinner size={48} />
                      <span className="camera-loading-text">Initializing Live Video Feed...</span>
                    </div>
                  )}

                  {/* AI Vision Reticle & Alignment HUD */}
                  <div className="camera-reticle-overlay" aria-hidden="true">
                    <div className="corner-bracket corner-top-left" />
                    <div className="corner-bracket corner-top-right" />
                    <div className="corner-bracket corner-bottom-left" />
                    <div className="corner-bracket corner-bottom-right" />
                    <div className="camera-scan-laser-line" />
                  </div>

                  <div className="camera-tip-badge">
                    <span>Position tray or pond basin in frame</span>
                  </div>
                </>
              )}
            </div>

            {/* Bottom Camera Toolbar */}
            {!cameraError && (
              <div className="camera-controls-bar">
                <button 
                  type="button" 
                  className="camera-tool-btn"
                  onClick={handleSwitchCamera}
                  title="Switch Camera (Front/Rear)"
                  aria-label="Switch camera"
                >
                  <SwitchCamera size={22} />
                </button>

                <button 
                  type="button" 
                  className="camera-shutter-btn"
                  onClick={handleCaptureLivePhoto}
                  disabled={isCameraStarting}
                  title="Capture Frame & Count Spawn"
                  aria-label="Capture live photo and count spawn"
                >
                  <div className="shutter-inner-ring" />
                </button>

                <div className="camera-tool-spacer" style={{ width: 48, height: 48 }} aria-hidden="true" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Scanning Modal Result / Output Card matching outputCardReference.png */}
      {(isAnalyzing || scanResult || scanError) && (
        <div 
          className="modal-backdrop output-modal-backdrop"
          onClick={() => {
            if (!isAnalyzing) {
              setScanResult(null);
              setScanError(null);
            }
          }}
        >
          {isAnalyzing ? (
            <div className="modal-card dual-fish-loading-card" onClick={(e) => e.stopPropagation()}>
              <DualFishLoader 
                text="Loading..." 
                size={140}
              />
            </div>
          ) : scanError ? (
            <div className="modal-card scan-error-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="scan-error-content" style={{ textAlign: 'center', padding: '12px' }}>
                <div className="result-header" style={{ justifyContent: 'center', marginBottom: '12px' }}>
                  <X size={36} style={{ color: '#EF4444' }} />
                  <h3 style={{ margin: 0, color: '#1F2937' }}>Backend Connection Notice</h3>
                </div>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: 1.5, marginBottom: '20px' }}>
                  {scanError}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="action-btn"
                    style={{ flex: 1, backgroundColor: '#E5E7EB', color: '#374151', padding: '10px' }}
                    onClick={() => setScanError(null)}
                  >
                    Dismiss
                  </button>
                  {scanError && scanError.toLowerCase().includes('token') ? (
                    <button 
                      type="button" 
                      className="action-btn primary-login-btn"
                      style={{ flex: 1, padding: '10px' }}
                      onClick={() => {
                        setScanError(null);
                        window.location.href = '/login';
                      }}
                    >
                      Sign In Again
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      className="action-btn primary-login-btn"
                      style={{ flex: 1, padding: '10px' }}
                      onClick={() => {
                        setScanError(null);
                        fileInputRef.current?.click();
                      }}
                    >
                      Select Another
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="modal-card output-card-modal" onClick={(e) => e.stopPropagation()}>
              {/* Top Scenic Landscape Header with outputCardMainBg.png */}
              <div 
                className="output-card-header"
                style={{ backgroundImage: `url(${outputCardMainBg})` }}
              />

              {/* Celebration Checkmark Badge */}
              <div className="output-celebration-wrapper">
                <CelebrationCheckmarkBadge />
              </div>

              {/* Title & Subtitle */}
              <div className="output-title-group">
                <h2 className="output-verified-title">Count Result Ready</h2>
                <p className="output-verified-sub">Backend result received. Metrics are shown only when provided.</p>
              </div>

              {/* Stats Box with outputCountBg.png */}
              <div 
                className="output-stats-card"
                style={{ backgroundImage: `url(${outputCountBg})` }}
              >
                {/* Left Stat: Fish Fry Detected */}
                <div className="output-stat-unit">
                  <div className="output-stat-circle-badge">
                    <OutputCardFishIcon size={26} color="#1D4ED8" />
                  </div>
                  <div className="output-stat-meta">
                    <span className="output-stat-label">Fish Fry Detected</span>
                    <span className="output-stat-value count-value">
                      {scanResult.count ?? '—'}
                    </span>
                    <OutputWaveSquiggle />
                  </div>
                </div>

                {/* Vertical Divider */}
                <div className="output-stat-separator" />

                {/* Right Stat: Processed in */}
                <div className="output-stat-unit">
                  <div className="output-stat-circle-badge">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="output-stat-meta">
                    <span className="output-stat-label">Processed in</span>
                    <span className="output-stat-value time-value">
                      {formatProcessingTime(scanResult.processingTime)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detection / Heatmap Preview Image */}
              <div className="output-image-card">
                <img 
                  src={scanResult.heatmapImg || scanningImage || trayImage} 
                  alt="Fish fry detection preview" 
                  className="output-detection-img" 
                />
                <button 
                  type="button" 
                  className="output-expand-icon-btn"
                  onClick={() => setShowHeatmapLightbox(true)}
                  title="View full resolution detection"
                  aria-label="Expand detection view"
                >
                  <Maximize2 size={16} color="#FFFFFF" strokeWidth={2.4} />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="output-actions-group">
                {/* Save to Hatchery Ledger Button */}
                <button 
                  type="button" 
                  className="output-primary-btn"
                  onClick={handleSaveToLedger}
                  disabled={isSavingCount}
                >
                  <div className="output-btn-left-content">
                    <Save size={20} color="#FFFFFF" strokeWidth={2.2} />
                    <span>{isSavingCount ? 'Saving…' : 'Save to Hatchery Ledger'}</span>
                  </div>
                  <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.2} className="output-arrow-right" />
                </button>

                {/* Count Another Image Button */}
                <button 
                  type="button" 
                  className="output-secondary-btn"
                  onClick={() => {
                    setScanResult(null);
                    setScanningImage(null);
                    setScanError(null);
                  }}
                >
                  <RotateCcw size={18} color="#2563EB" strokeWidth={2.4} />
                  <span>Count Another Image</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Heatmap Fullscreen Lightbox Modal */}
      {showHeatmapLightbox && (
        <div className="modal-backdrop lightbox-backdrop" onClick={() => setShowHeatmapLightbox(false)}>
          <div className="lightbox-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <span className="lightbox-title">AI Detection Inspection (Count: {scanResult?.count ?? 609})</span>
              <button 
                type="button" 
                className="lightbox-close-btn"
                onClick={() => setShowHeatmapLightbox(false)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
            <div className="lightbox-body">
              <img 
                src={scanResult?.heatmapImg || scanningImage || trayImage} 
                alt="High-resolution fish fry detection" 
                className="lightbox-full-img"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfileModal && (
        <div className="modal-backdrop" onClick={() => setShowEditProfileModal(false)}>
          <div className="modal-card profile-edit-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-header-left">
                <div className="drawer-header-icon-badge">
                  <User size={19} color="#2563EB" strokeWidth={2.4} />
                </div>
                <div>
                  <h3 className="drawer-title">Edit Account & Contact</h3>
                  <p className="drawer-subtitle">Update your profile & contact details</p>
                </div>
              </div>
              <button 
                type="button" 
                className="drawer-close-btn"
                onClick={() => setShowEditProfileModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form 
              className="profile-edit-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSavingProfile(true);
                try {
                  const result = await updateProfile({
                    username: editFormData.username,
                    role: editFormData.role,
                    fullName: user?.fullName || editFormData.username,
                    email: editFormData.email,
                    phone: editFormData.phone,
                    pondLocation: editFormData.location,
                  });
                  const updated = result.user;
                  setProfileUsername(updated.username);
                  setProfileRole(updated.role);
                  setProfileEmail(updated.email);
                  setProfilePhone(updated.phone || '');
                  setProfileLocation(updated.pondLocation || '');
                  setShowEditProfileModal(false);
                  showProfileToastMsg('Profile details updated successfully');
                } catch (error) {
                  showProfileToastMsg(error.message || 'Could not update profile');
                } finally {
                  setIsSavingProfile(false);
                }
              }}
            >
              <div className="form-group">
                <label className="form-label">Username</label>
                <div className="profile-input-wrapper">
                  <User size={17} className="profile-input-icon" />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Enter username"
                    value={editFormData.username}
                    onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Operational Role</label>
                <div className="profile-input-wrapper">
                  <Briefcase size={17} className="profile-input-icon" />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Hatchery Operator"
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="profile-input-wrapper">
                  <Mail size={17} className="profile-input-icon" />
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="name@aquafarm.com"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <div className="profile-input-wrapper">
                  <Phone size={17} className="profile-input-icon" />
                  <input 
                    type="tel" 
                    className="form-input" 
                    placeholder="+91 98765 43210"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="profile-edit-btn-row">
                <button 
                  type="button" 
                  className="action-btn secondary-btn"
                  onClick={() => setShowEditProfileModal(false)}
                  disabled={isSavingProfile}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="action-btn primary-btn"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Farm Location Picker Modal */}
      {showLocationPickerModal && (
        <div className="modal-backdrop" onClick={() => setShowLocationPickerModal(false)}>
          <div className="modal-card profile-picker-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-header-left">
                <div className="drawer-header-icon-badge">
                  <MapPin size={18} color="#2563EB" />
                </div>
                <div>
                  <h3 className="drawer-title">Select Farm Location</h3>
                  <p className="drawer-subtitle">Choose active nursery or pond area</p>
                </div>
              </div>
              <button 
                type="button" 
                className="drawer-close-btn"
                onClick={() => setShowLocationPickerModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="profile-picker-list">
              {[
                'Pond Delta #4',
                'Nursery Tray #2',
                'Spawn Tank A',
                'Main Pond #1',
                'Breeding Basin C'
              ].map((loc) => (
                <div 
                  key={loc}
                  className={`profile-picker-option ${profileLocation === loc ? 'selected' : ''}`}
                  onClick={async () => {
                    try {
                      const result = await updateProfile({
                        username: profileUsername, role: profileRole,
                        fullName: user?.fullName || profileUsername,
                        email: profileEmail, phone: profilePhone, pondLocation: loc,
                      });
                      setProfileLocation(result.user.pondLocation || loc);
                      setShowLocationPickerModal(false);
                      showProfileToastMsg(`Location switched to ${loc}`);
                    } catch (error) {
                      showProfileToastMsg(error.message || 'Could not save the location');
                    }
                  }}
                >
                  <div className="picker-option-left">
                    <MapPin size={17} fill={profileLocation === loc ? '#2563EB' : 'none'} color="#2563EB" />
                    <span>{loc}</span>
                  </div>
                  {profileLocation === loc && <Check size={18} color="#2563EB" strokeWidth={2.4} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Language Picker Modal */}
      {showLanguagePickerModal && (
        <div className="modal-backdrop" onClick={() => setShowLanguagePickerModal(false)}>
          <div className="modal-card profile-picker-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-header-left">
                <div className="drawer-header-icon-badge">
                  <Globe size={18} color="#2563EB" />
                </div>
                <div>
                  <h3 className="drawer-title">Choose Language</h3>
                  <p className="drawer-subtitle">Select your preferred app language</p>
                </div>
              </div>
              <button 
                type="button" 
                className="drawer-close-btn"
                onClick={() => setShowLanguagePickerModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="profile-picker-list">
              {['English', 'Español', 'Bahasa Indonesia', 'Tiếng Việt', 'हिन्दी'].map((lang) => (
                <div 
                  key={lang}
                  className={`profile-picker-option ${profileLanguage === lang ? 'selected' : ''}`}
                  onClick={async () => {
                    try {
                      await updateUserSettings({ language: lang });
                      setProfileLanguage(lang);
                      setShowLanguagePickerModal(false);
                      showProfileToastMsg(`Language set to ${lang}`);
                    } catch (error) {
                      showProfileToastMsg(error.message || 'Could not save language preference');
                    }
                  }}
                >
                  <div className="picker-option-left">
                    <Globe size={17} color="#2563EB" />
                    <span>{lang}</span>
                  </div>
                  {profileLanguage === lang && <Check size={18} color="#2563EB" strokeWidth={2.4} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Theme Picker Modal */}
      {showThemePickerModal && (
        <div className="modal-backdrop" onClick={() => setShowThemePickerModal(false)}>
          <div className="modal-card profile-picker-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-header-left">
                <div className="drawer-header-icon-badge">
                  <Palette size={18} color="#2563EB" />
                </div>
                <div>
                  <h3 className="drawer-title">App Theme</h3>
                  <p className="drawer-subtitle">Switch visual appearance</p>
                </div>
              </div>
              <button 
                type="button" 
                className="drawer-close-btn"
                onClick={() => setShowThemePickerModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="profile-picker-list">
              {['Light (Default)', 'Dark (OLED)', 'System Appearance'].map((th) => (
                <div 
                  key={th}
                  className={`profile-picker-option ${profileTheme === th ? 'selected' : ''}`}
                  onClick={async () => {
                    setProfileTheme(th);
                    localStorage.setItem(THEME_STORAGE_KEY, th);
                    applyTheme(th);
                    setShowThemePickerModal(false);
                    showProfileToastMsg(`Theme set to ${th}`);
                    try {
                      await updateUserSettings({ theme: th });
                    } catch (error) {
                      console.warn('Could not save theme preference to server:', error);
                    }
                  }}
                >
                  <div className="picker-option-left">
                    <Palette size={17} color="#2563EB" />
                    <span>{th}</span>
                  </div>
                  {profileTheme === th && <Check size={18} color="#2563EB" strokeWidth={2.4} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Profile Toast Bar */}
      {profileToast && (
        <div className="profile-toast-bar" role="status">
          <CheckCircle2 size={16} color="#10B981" />
          <span>{profileToast}</span>
        </div>
      )}
    </div>
  );
}
