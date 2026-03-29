'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();
  const authCheckRef = useRef(false);  // Prevent double auth checks

  useEffect(() => {
    // Only run auth check once on mount
    if (!authCheckRef.current) {
      authCheckRef.current = true;
      checkAuth();
    }
  }, []);

  async function checkAuth() {
    try {
      const token = localStorage.getItem('grouphub_token');
      if (!token) {
        setLoading(false);
        return;
      }
      
      const userData = await api.getMe();
      setUser(userData);
      setError(null);
    } catch (err) {
      // Expected auth failure, silently remove token
      if (err.message && err.message.includes('Could not validate')) {
        localStorage.removeItem('grouphub_token');
      } else {
        console.error('Auth check failed:', err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    setError(null);
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Please enter a valid email address');
      }

      console.log('Attempting login for:', email);
      const data = await api.login(email, password);
      
      if (!data || !data.access_token) {
        throw new Error('Invalid login response - no token received');
      }

      // Validate token format (basic check)
      if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
        throw new Error('Invalid token received');
      }

      console.log('Login successful, token received. Setting up user...');
      localStorage.setItem('grouphub_token', data.access_token);
      
      if (data.user) {
        setUser(data.user);
        console.log('User set:', data.user.username);
      }
      
      // Give a short delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Redirecting to dashboard...');
      router.push('/dashboard');
      return data;
    } catch (err) {
      const errorMsg = err.message || 'Login failed. Please try again.';
      setError(errorMsg);
      console.error('Login error:', err);
      throw err;
    }
  }

  async function register(username, email, password) {
    setError(null);
    try {
      if (!username || !email || !password) {
        throw new Error('username, email, and password are required');
      }

      // Basic validation
      if (username.length < 3) {
        throw new Error('Username must be at least 3 characters');
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Please enter a valid email address');
      }

      if (password.length < 10) {
        throw new Error('Password must be at least 10 characters');
      }

      console.log('Attempting registration for:', email);
      const data = await api.register(username, email, password);
      
      if (!data || !data.access_token) {
        throw new Error('Invalid registration response');
      }

      // Validate token format (basic check)
      if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
        throw new Error('Invalid token received');
      }

      console.log('Registration successful, token received. Setting up user...');
      localStorage.setItem('grouphub_token', data.access_token);
      
      if (data.user) {
        setUser(data.user);
        console.log('User set:', data.user.username);
      }
      
      // Give a short delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Redirecting to dashboard...');
      router.push('/dashboard');
      return data;
    } catch (err) {
      const errorMsg = err.message || 'Registration failed. Please try again.';
      setError(errorMsg);
      console.error('Registration error:', err);
      throw err;
    }
  }

  function logout() {
    localStorage.removeItem('grouphub_token');
    setUser(null);
    setError(null);
    router.push('/');
  }

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        loading, 
        error, 
        login, 
        register, 
        logout, 
        checkAuth,
        setError 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
