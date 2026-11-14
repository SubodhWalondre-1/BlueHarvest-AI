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
import AuthenticatedImage from './AuthenticatedImage';
import ContactVerification from './ContactVerification';
import { buildLedgerCsv, DEMO_REPORT_LABEL, escapeHtml } from '../utils/reports';
import { compressImageIfNeeded } from '../utils/imageCompressor';
import { getApiBaseUrl, processImage, listCountSessions, saveCountSession, deleteCountSession, getDashboardSummary, getDemoStatus, getUserSettings, updateProfile, updateUserSettings, getNotifications, markNotificationRead } from '../api/client';
import { applyTheme, setupSystemThemeListener, THEME_STORAGE_KEY } from '../utils/theme';
import { calculateBatchPrice, formatPriceINR } from '../utils/pricing';
import { calculateMortalityAnalysis } from '../utils/mortality';
import { FishIcon, CountingSessionsIcon, BasinIcon, IndianRupeeIcon, OutputCardFishIcon } from './icons/AppIcons';
import ScanResultModal from './modals/ScanResultModal';
import LiveCameraModal from './modals/LiveCameraModal';
import DashboardTab from './tabs/DashboardTab';
import LedgerTab from './tabs/LedgerTab';
import InsightsTab from './tabs/InsightsTab';
import ProfileTab from './tabs/ProfileTab';



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
  useEffect(() => () => {
    if (scanningImage?.startsWith('blob:')) URL.revokeObjectURL(scanningImage);
  }, [scanningImage]);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
  const contactChangesPending = editFormData.email.trim().toLowerCase() !== profileEmail.toLowerCase()
    || (editFormData.phone.replace(/[\s().-]/g, '') || null) !== (profilePhone.replace(/[\s().-]/g, '') || null);

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
    if (insightsError || insightsLoading) {
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
          <title>BlueHarvest - Farm Insights Report (${escapeHtml(activeInsightsRange)})</title>
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
              <p class="subtitle">Time Range: ${escapeHtml(activeInsightsRange)} • Exported: ${new Date().toLocaleDateString()}</p>
            </div>
            <div>
              <strong>${escapeHtml(user?.pondLocation || 'Location not recorded')}</strong>
            </div>
          </div>
          <p>${current.includesDemo ? escapeHtml(DEMO_REPORT_LABEL) : 'Saved backend-verified count records'}</p>
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
                  <td><strong>${escapeHtml(l.name)}</strong></td>
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
    listCountSessions({ includeDemo: demoModeEnabled })
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
          includesDemo: Boolean(data.includes_demo_data),
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
  }, [user?.id, activeInsightsRange, demoModeEnabled, historyItems]);

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
    setIsAnalyzing(true);
    setScanResult(null);
    setScanError(null);

    let processedFile = file;
    try {
      processedFile = await compressImageIfNeeded(file);
    } catch (compressionErr) {
      console.warn('Image optimization skipped:', compressionErr);
    }

    const url = URL.createObjectURL(processedFile);
    setScanningImage(url);

    try {
      const data = await processImage(processedFile, source);
      if (!data.session_id) {
        throw new Error('The backend did not store an inference session. Please run the scan again.');
      }
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
        sessionId: data.session_id,
        count,
        confidence,
        density,
        avgLength,
        processingTime,
        channel,
        heatmapImg: data.final_heatmap || data.heatmap || data.components || null,
        image: data.image_url || data.image_path || url,
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
    e.target.value = '';
    if (file) {
      processSelectedFile(file, 'Uploaded');
    }
  };

  const handleSaveToLedger = async () => {
    if (!scanResult?.sessionId || isSavingCount) return;
    setIsSavingCount(true);
    setScanError(null);
    try {
      const saved = await saveCountSession(scanResult.sessionId);
      setHistoryItems((items) => [mapSessionToHistoryItem(saved), ...items.filter((item) => item.sessionId !== saved.session_id)]);
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
    const csvUrl = URL.createObjectURL(new Blob([buildLedgerCsv(batch)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement("a");
    link.setAttribute("href", csvUrl);
    link.setAttribute("download", `${batch.id}-ledger.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(csvUrl), 1000);
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
              <img src="/blueharvest-logo.png" alt="Blue Harvest Logo" className="home-logo-img" />
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
          <DashboardTab 
            fileInputRef={fileInputRef} 
            onOpenLiveCamera={() => setShowLiveCamera(true)} 
          />
        )}

        {/* History Tab View matching historySectionReference.png */}
        {activeTab === 'history' && (
          <LedgerTab
            historyItems={historyItems}
            historyLoading={historyLoading}
            historyError={historyError}
            historySearchQuery={historySearchQuery}
            setHistorySearchQuery={setHistorySearchQuery}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            showFilterDropdown={showFilterDropdown}
            setShowFilterDropdown={setShowFilterDropdown}
            activeActionMenuId={activeActionMenuId}
            setActiveActionMenuId={setActiveActionMenuId}
            activeGroups={activeGroups}
            groupedHistory={groupedHistory}
            setSelectedBatchModal={setSelectedBatchModal}
            handleExportCSV={handleExportCSV}
            handleDeleteBatch={handleDeleteBatch}
          />
        )}

        {/* Farm Insights Tab View matching insightsReference.png */}
        {(activeTab === 'insights' || activeTab === 'reports') && (
          <InsightsTab
            activeInsightsRange={activeInsightsRange}
            setActiveInsightsRange={setActiveInsightsRange}
            insightsData={insightsData}
            insightsLoading={insightsLoading}
            insightsError={insightsError}
            handleDownloadPDFReport={handleDownloadPDFReport}
          />
        )}

        {/* Profile Tab View */}
        {activeTab === 'profile' && (
          <ProfileTab
            profileUsername={profileUsername}
            profileRole={profileRole}
            profileEmail={profileEmail}
            profilePhone={profilePhone}
            profileLocation={profileLocation}
            profileNotificationsEnabled={profileNotificationsEnabled}
            setProfileNotificationsEnabled={setProfileNotificationsEnabled}
            profileLanguage={profileLanguage}
            profileTheme={profileTheme}
            setEditFormData={setEditFormData}
            setShowEditProfileModal={setShowEditProfileModal}
            setShowLocationPickerModal={setShowLocationPickerModal}
            setShowLanguagePickerModal={setShowLanguagePickerModal}
            setShowThemePickerModal={setShowThemePickerModal}
            updateUserSettings={updateUserSettings}
            showProfileToastMsg={showProfileToastMsg}
            onLogout={onLogout}
          />
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
            <h3 className="profile-modal-name">{user?.username || 'Hatchery Operator'}</h3>
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
              <AuthenticatedImage
                src={selectedBatchModal.image || heroImage} 
                fallbackSrc={heroImage}
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

            <div className="batch-modal-meta-grid">
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
              <button 
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
      <LiveCameraModal
        isOpen={showLiveCamera}
        onClose={stopCamera}
        cameraError={cameraError}
        onRetry={() => startCamera(cameraFacingMode)}
        videoRef={videoRef}
        isCameraStarting={isCameraStarting}
        onSwitchCamera={handleSwitchCamera}
        onCapture={handleCaptureLivePhoto}
      />

      {/* AI Scanning Modal Result / Output Card & Heatmap Lightbox */}
      <ScanResultModal
        isAnalyzing={isAnalyzing}
        scanResult={scanResult}
        scanError={scanError}
        scanningImage={scanningImage}
        isSavingCount={isSavingCount}
        onDismiss={() => {
          setScanResult(null);
          setScanError(null);
        }}
        onSaveToLedger={handleSaveToLedger}
        onSelectAnother={() => {
          setScanError(null);
          fileInputRef.current?.click();
        }}
        onResetScan={() => {
          setScanResult(null);
          setScanningImage(null);
          setScanError(null);
        }}
        onRetryLogin={() => {
          setScanError(null);
          window.location.href = '/login';
        }}
      />

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
                if (contactChangesPending) return;
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
                  />
                </div>
              </div>

              <ContactVerification email={editFormData.email} phone={editFormData.phone}
                currentEmail={profileEmail} currentPhone={profilePhone}
                onVerified={(updated) => {
                  setProfileEmail(updated.email);
                  setProfilePhone(updated.phone || '');
                  showProfileToastMsg('Contact details verified and updated');
                }} />

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
                  disabled={isSavingProfile || contactChangesPending}
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
