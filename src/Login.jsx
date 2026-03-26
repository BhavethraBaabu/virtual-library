import { auth, googleProvider } from './firebase';
import { signInWithPopup } from 'firebase/auth';

function Login() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed. Check your Firebase Google Auth settings!");
    }
  };

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100svh',
      padding: 'clamp(16px, 5vw, 28px)',
      background: 'radial-gradient(circle, #1e2c1e 0%, #0a0f0a 100%)',
      color: 'white'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        padding: 'clamp(18px, 5vw, 28px)',
        borderRadius: '28px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 28px 70px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(18px)',
        textAlign: 'center',
      }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 6vw, 2.7rem)', letterSpacing: '-1px' }}>
          Virtual Library 🌿
        </h1>
        <p style={{ marginTop: '12px', marginBottom: 0, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>
          A social Pomodoro for remote students. Stay on the tab to keep the garden alive.
        </p>

        <button
          onClick={handleLogin}
          style={{
            marginTop: '22px',
            width: '100%',
            padding: '14px 16px',
            fontSize: '16px',
            cursor: 'pointer',
            background: '#4285F4',
            color: 'white',
            border: 'none',
            borderRadius: '999px',
            fontWeight: 800,
            boxShadow: '0 18px 45px rgba(0,0,0,0.35)',
          }}
        >
          Continue with Google
        </button>

        <p style={{ fontSize: '12px', marginTop: '14px', color: 'rgba(255,255,255,0.55)' }}>
          No sign-up required. Use your Google account.
        </p>
      </div>
    </div>
  );
}

export default Login;