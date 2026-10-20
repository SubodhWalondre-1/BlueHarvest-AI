import React, { useState, useEffect } from 'react';
import LoginView from './components/LoginView';
import SignUpView from './components/SignUpView';
import HomePage from './components/HomePage';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import { restoreAuthSession, logoutUser } from './api/client';
import { applyTheme, setupSystemThemeListener, THEME_STORAGE_KEY } from './utils/theme';
import './App.css';

/**
 * Parses route info from current browser location.
 * Supports /login, /signup, /home, /count, /pipeline, /history, /reports, /profile
 * and legacy ?screen= query parameter.
 */
function parseRouteFromLocation() {
  if (typeof window === 'undefined') {
    return { screen: 'login', tab: 'home', countTrigger: false };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const screenParam = searchParams.get('screen');

  if (screenParam) {
    return {
      screen: screenParam === 'signup' ? 'signup' : screenParam === 'home' ? 'home' : 'login',
      tab: searchParams.get('tab') || 'home',
      countTrigger: searchParams.get('action') === 'count',
    };
  }

  const rawPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  if (rawPath === '/signup') {
    return { screen: 'signup', tab: 'home', countTrigger: false };
  }
  if (rawPath === '/login') {
    return { screen: 'login', tab: 'home', countTrigger: false };
  }
  if (rawPath === '/history') {
    return { screen: 'home', tab: 'history', countTrigger: false };
  }
  if (rawPath === '/reports' || rawPath === '/insights') {
    return { screen: 'home', tab: 'insights', countTrigger: false };
  }
  if (rawPath === '/profile') {
    return { screen: 'home', tab: 'profile', countTrigger: false };
  }
  if (rawPath === '/count' || rawPath === '/pipeline') {
    return { screen: 'home', tab: 'home', countTrigger: true };
  }
  if (rawPath === '/home') {
    return { screen: 'home', tab: 'home', countTrigger: false };
  }

  // Root '/' defaults to 'login' unless a stored session exists
  return { screen: 'login', tab: 'home', countTrigger: false };
}

export default function App() {
  const [route, setRoute] = useState(parseRouteFromLocation);
  // The server, not localStorage, is the source of truth for the active session.
  const [currentUser, setCurrentUser] = useState(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [notification, setNotification] = useState(null);
  const [autoTriggerCount, setAutoTriggerCount] = useState(route.countTrigger ? Date.now() : null);

  // Sync state on browser back/forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const currentRoute = parseRouteFromLocation();
      setRoute(currentRoute);
      if (currentRoute.countTrigger) {
        setAutoTriggerCount(Date.now());
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize and track theme preference (Light, Dark OLED, or System Appearance)
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'Light (Default)';
    applyTheme(savedTheme);

    const cleanupListener = setupSystemThemeListener(() => {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'Light (Default)';
    });
    return cleanupListener;
  }, []);

  const navigateTo = (path, replace = false) => {
    if (typeof window !== 'undefined') {
      if (replace) {
        window.history.replaceState(null, '', path);
      } else {
        window.history.pushState(null, '', path);
      }
    }
    const currentRoute = parseRouteFromLocation();
    setRoute(currentRoute);
    if (currentRoute.countTrigger) {
      setAutoTriggerCount(Date.now());
    }
  };

  // Revalidate any persisted client hint against FastAPI on startup. A saved
  // localStorage user is display state only; it is not treated as authentication.
  useEffect(() => {
    let cancelled = false;
    restoreAuthSession().then((verifiedUser) => {
      if (cancelled) return;
      if (verifiedUser) {
        setCurrentUser(verifiedUser);
        try { localStorage.setItem('blueharvest_user', JSON.stringify(verifiedUser)); } catch { /* storage optional */ }
        if (window.location.pathname === '/' || window.location.pathname === '') {
          window.history.replaceState(null, '', '/home');
          setRoute(parseRouteFromLocation());
        }
      } else {
        setCurrentUser(null);
        try { localStorage.removeItem('blueharvest_user'); } catch { /* storage optional */ }
        const currentRoute = parseRouteFromLocation();
        if (currentRoute.screen === 'home') {
          window.history.replaceState(null, '', '/login');
          setRoute(parseRouteFromLocation());
        }
      }
    }).catch(() => {
      // Keep the login page usable when the local backend is not running yet.
    });
    return () => { cancelled = true; };
  }, []);

  const handleLoginSuccess = (userData) => {
    setCurrentUser(userData);
    try {
      localStorage.setItem('blueharvest_user', JSON.stringify(userData));
    } catch {
      // ignore storage error
    }
    navigateTo('/home');
    setNotification(`Welcome back, ${userData.username}!`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSignUpSuccess = (userData) => {
    setCurrentUser(userData);
    try {
      localStorage.setItem('blueharvest_user', JSON.stringify(userData));
    } catch {
      // ignore storage error
    }
    navigateTo('/home');
    setNotification(`Account created for ${userData.username}!`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogout = async () => {
    try { await logoutUser(); } catch { /* clear local state even if API is unavailable */ }
    setCurrentUser(null);
    try {
      localStorage.removeItem('blueharvest_user');
    } catch {
      // ignore storage error
    }
    navigateTo('/login');
  };

  const handleTabChange = (newTab) => {
    navigateTo(`/${newTab}`);
  };

  const handleCountRequested = () => {
    navigateTo('/count');
  };

  return (
    <div className={`app-viewport-wrapper screen-${route.screen}`}>
      <div className={`app-mobile-container mode-${route.screen}`}>
        {route.screen === 'login' && (
          <LoginView 
            onLoginSuccess={handleLoginSuccess}
            onSwitchToSignUp={() => navigateTo('/signup')}
            onForgotPassword={() => setShowForgotModal(true)}
          />
        )}

        {route.screen === 'signup' && (
          <SignUpView 
            onSignUpSuccess={handleSignUpSuccess}
            onSwitchToLogin={() => navigateTo('/login')}
          />
        )}

        {route.screen === 'home' && (
          <HomePage 
            user={currentUser} 
            activeTab={route.tab}
            onTabChange={handleTabChange}
            onCountRequested={handleCountRequested}
            autoTriggerCount={autoTriggerCount}
            onLogout={handleLogout} 
          />
        )}

        {notification && (
          <div className="app-toast-notification" role="status">
            <span>{notification}</span>
          </div>
        )}
      </div>

      <ForgotPasswordModal 
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
      />
    </div>
  );
}
