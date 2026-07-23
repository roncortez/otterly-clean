import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../../../shared/lib/firebaseConfig";
import axios from "axios";
import Loading from "../../../shared/ui/Loading";
import { FaHome, FaEye, FaEyeSlash, FaArrowLeft } from "react-icons/fa";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-forest-500 focus:ring-1 focus:ring-forest-500/20";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-forest-700";

const Login = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telefono, setTelefono] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetForm, setShowResetForm] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [registered, setRegistered] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/getUserRole`,
        { email }
      );
      if (response.status !== 200) throw new Error("Server error");
      const userRole = response.data.role;
      onLoginSuccess(userRole);
      navigate(userRole === "admin" ? "/admin" : "/");
    } catch (error) {
      console.error("Error signing in:", error);
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/auth/register`, {
        email,
        first_name: firstName,
        last_name: lastName,
        password,
        role: "user",
        telefono,
      });
      setRegistered(true);
      setShowRegisterForm(false);
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setTelefono("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Error during registration:", error);
      if (error.code === "auth/email-already-in-use") {
        setError("This email is already registered.");
      } else {
        setError("Error creating account. Please try again.");
      }
      if (error.code !== "auth/email-already-in-use") {
        try { await auth.currentUser.delete(); } catch {}
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Reset link sent to your email.");
      setShowResetForm(false);
    } catch (error) {
      setError("Error sending reset email.");
    }
  };

  if (loading) return <Loading />;

  return (
    <main className="min-h-screen bg-gray-50 px-5 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto flex max-w-md flex-col items-center">
        {/* Logo / brand */}
        <a href="/" className="flex items-center gap-2.5 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-600">
            <FaHome className="text-base text-white" />
          </div>
          <span className="font-display text-xl font-bold text-forest-800">Otterly Clean</span>
        </a>

        <div className="w-full rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
          {/* ─── LOGIN ─── */}
          {!showRegisterForm && !showResetForm && (
            <>
              <h2 className="font-display text-xl font-bold text-forest-800">Welcome back</h2>
              <p className="mt-1 text-sm text-forest-500">Sign in to your account.</p>

              {registered && (
                <div className="mt-4 rounded-lg border border-forest-200 bg-sage-50 px-4 py-3 text-sm text-forest-700">
                  Account created successfully! You can now sign in.
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
                <label className={labelClass}>
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={inputClass} />
                </label>
                <label className={labelClass}>
                  Password
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className={inputClass} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600">
                      {showPassword ? <FaEyeSlash className="text-sm" /> : <FaEye className="text-sm" />}
                    </button>
                  </div>
                </label>

                <button type="submit"
                  className="h-11 rounded-lg bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
                  Sign In
                </button>
              </form>

              <div className="mt-5 flex flex-col items-center gap-3">
                <button type="button" onClick={() => { setShowResetForm(true); setError(""); }}
                  className="text-xs font-medium text-forest-500 transition-colors hover:text-forest-700">
                  Forgot your password?
                </button>
                <p className="text-sm text-forest-400">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => { setShowRegisterForm(true); setError(""); }}
                    className="font-semibold text-primary-600 transition-colors hover:text-primary-700">
                    Create one
                  </button>
                </p>
              </div>
            </>
          )}

          {/* ─── REGISTER ─── */}
          {showRegisterForm && (
            <>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => { setShowRegisterForm(false); setError(""); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-forest-400 transition-colors hover:bg-gray-100 hover:text-forest-600">
                  <FaArrowLeft className="text-sm" />
                </button>
                <div>
                  <h2 className="font-display text-xl font-bold text-forest-800">Create account</h2>
                  <p className="mt-0.5 text-sm text-forest-500">Join Otterly Clean today.</p>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>
                    First Name
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" required className={inputClass} />
                  </label>
                  <label className={labelClass}>
                    Last Name
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" required className={inputClass} />
                  </label>
                </div>
                <label className={labelClass}>
                  Phone
                  <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="0912345678" required className={inputClass} />
                </label>
                <label className={labelClass}>
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={inputClass} />
                </label>
                <label className={labelClass}>
                  Password
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" required className={inputClass} />
                </label>
                <label className={labelClass}>
                  Confirm Password
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required className={inputClass} />
                </label>

                <button type="submit"
                  className="h-11 rounded-lg bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
                  Create Account
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-forest-400">
                Already have an account?{" "}
                <button type="button" onClick={() => { setShowRegisterForm(false); setError(""); }}
                  className="font-semibold text-primary-600 transition-colors hover:text-primary-700">
                  Sign in
                </button>
              </p>
            </>
          )}

          {/* ─── RESET PASSWORD ─── */}
          {showResetForm && (
            <>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => { setShowResetForm(false); setError(""); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-forest-400 transition-colors hover:bg-gray-100 hover:text-forest-600">
                  <FaArrowLeft className="text-sm" />
                </button>
                <div>
                  <h2 className="font-display text-xl font-bold text-forest-800">Reset password</h2>
                  <p className="mt-0.5 text-sm text-forest-500">We'll send you a reset link.</p>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <form onSubmit={handlePasswordReset} className="mt-6 flex flex-col gap-4">
                <label className={labelClass}>
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={inputClass} />
                </label>

                <button type="submit"
                  className="h-11 rounded-lg bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
                  Send Reset Link
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-forest-400">
                Remember your password?{" "}
                <button type="button" onClick={() => { setShowResetForm(false); setError(""); }}
                  className="font-semibold text-primary-600 transition-colors hover:text-primary-700">
                  Sign in
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default Login;
