import { useMemo, useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  increment,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  runTransaction,
  updateDoc,
  where,
  addDoc,
  setDoc,
} from 'firebase/firestore';
import Login from './Login';
import { QRCodeCanvas } from 'qrcode.react';

function App() {
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [timeLeft, setTimeLeft] = useState("25:00");
  const [inputCode, setInputCode] = useState(""); // For manual joining
  const [manageOpen, setManageOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userStats, setUserStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  const me = useMemo(() => {
    if (!user) return null;
    return {
      uid: user.uid,
      name: user.displayName || user.email || 'Student',
    };
  }, [user]);

  const inviteUrl = useMemo(() => {
    if (!roomId) return '';
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      return url.toString();
    } catch {
      return `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    }
  }, [roomId]);

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, "userStats", me.uid), (snap) => {
      setUserStats(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const fetchRecent = async () => {
      try {
        const q = query(
          collection(db, "users", me.uid, "history"),
          orderBy("endedAt", "desc"),
          limit(5)
        );
        const snap = await getDocs(q);
        setRecentSessions(snap.docs.map((d) => d.data()));
      } catch {
        setRecentSessions([]);
      }
    };
    fetchRecent();
  }, [me]);

  useEffect(() => {
    if (!me) return;
    if (!roomData || roomData.status === "active") return;
    const t = window.setTimeout(async () => {
      try {
        const q = query(
          collection(db, "users", me.uid, "history"),
          orderBy("endedAt", "desc"),
          limit(5)
        );
        const snap = await getDocs(q);
        setRecentSessions(snap.docs.map((d) => d.data()));
      } catch {
        setRecentSessions([]);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [me, roomData?.status]);

  const isHost = !!(roomData?.hostUid && me?.uid && roomData.hostUid === me.uid);
  const isAdmin = !!(roomData?.admins?.includes?.(me?.uid));
  const canManage = isHost || isAdmin;

  const completionRate = useMemo(() => {
    const completed = userStats?.completedSessions || 0;
    const withered = userStats?.witheredSessions || 0;
    const total = completed + withered;
    if (total <= 0) return null;
    return Math.round((completed / total) * 100);
  }, [userStats]);

  const focusThisSessionMinutes = useMemo(() => {
    if (!roomData || !me?.uid) return null;
    if (roomData.status === "active") return null;
    const myMember = (roomData.members || []).find((m) => m?.uid === me.uid);
    if (!myMember?.joinedAt) return null;
    const endedMs = roomData.endedAt || roomData.timerEnd || Date.now();
    const minutes = Math.floor(Math.max(0, endedMs - myMember.joinedAt) / 60000);
    return Number.isFinite(minutes) ? minutes : null;
  }, [roomData, me]);

  // --- 1. THE THEME (Glassmorphism) ---
  const theme = {
    bg: darkMode 
      ? (roomData?.status === 'withered' ? 'radial-gradient(circle, #2c1e1e 0%, #110a0a 100%)' : 'radial-gradient(circle, #1e2c1e 0%, #0a0f0a 100%)')
      : (roomData?.status === 'withered' ? 'radial-gradient(circle, #fff5f5 0%, #ffe0e0 100%)' : 'radial-gradient(circle, #f0fdf4 0%, #dcfce7 100%)'),
    text: darkMode ? '#ffffff' : '#166534',
    card: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.7)',
    border: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(22, 101, 52, 0.1)',
    accent: darkMode ? '#a1ffb1' : '#15803d',
    shadow: darkMode ? '0 20px 50px rgba(0,0,0,0.5)' : '0 20px 50px rgba(22, 101, 52, 0.1)',
  };

  // --- 2. GROWTH LOGIC (🌰 -> 🌱 -> 🌿 -> 🌳) ---
  const getGardenEmoji = () => {
    if (roomData?.status === 'withered') return '🥀';
    if (!roomData?.timerEnd) return '🌳';
    const distance = roomData.timerEnd - Date.now();
    const minsRemaining = distance / 1000 / 60;
    if (minsRemaining > 20) return '🌰';
    if (minsRemaining > 15) return '🌱';
    if (minsRemaining > 10) return '🌿';
    if (minsRemaining > 5) return '🌳';
    return '🍎';
  };

  const ensureLegacyRoomUpgraded = async (roomRef, data) => {
    // Backfill new fields for older rooms so role logic works.
    // Best-effort only; if it fails we keep going.
    try {
      const patch = {};
      if (!data?.maxMembers) patch.maxMembers = 4;
      if (typeof data?.locked !== 'boolean') patch.locked = false;
      if (!Array.isArray(data?.admins)) patch.admins = [];
      if (!Array.isArray(data?.bannedUids)) patch.bannedUids = [];
      if (!Array.isArray(data?.members)) patch.members = [];
      if (!data?.hostUid && data?.createdByUid) patch.hostUid = data.createdByUid;
      if (Object.keys(patch).length) await updateDoc(roomRef, patch);
    } catch {
      // ignore
    }
  };

  const joinRoomById = async (id) => {
    if (!me) return;
    const trimmed = (id || '').trim();
    if (!trimmed) return alert("Enter a code first!");

    try {
      const roomRef = doc(db, "rooms", trimmed);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return alert("Room not found!");
      const data = snap.data();

      await ensureLegacyRoomUpgraded(roomRef, data);

      if (data?.status !== 'active') return alert("Garden already withered.");
      if (data?.bannedUids?.includes?.(me.uid)) return alert("You can’t join this room.");
      if (data?.locked && !(data?.hostUid === me.uid || data?.admins?.includes?.(me.uid))) {
        return alert("Room is locked.");
      }

      const currentMembers = Array.isArray(data?.members) ? data.members : [];
      const alreadyInRoom = currentMembers.some((m) => m?.uid === me.uid);
      const maxMembers = data?.maxMembers || 4;
      if (!alreadyInRoom && (data?.memberCount ?? currentMembers.length) >= maxMembers) {
        return alert("Room full!");
      }

      if (!alreadyInRoom) {
        await updateDoc(roomRef, {
          memberCount: (data?.memberCount ?? currentMembers.length) + 1,
          members: arrayUnion({ uid: me.uid, name: me.name, joinedAt: Date.now() }),
        });
      }

      setRoomId(trimmed);
    } catch {
      alert("Check your code.");
    }
  };

  // --- 3. JOIN LOGIC (Direct & Random) ---
  const joinSpecificRoom = async () => {
    return joinRoomById(inputCode);
  };

  const joinRandomRoom = async () => {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("status", "==", "active"), where("locked", "==", false));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const existing = querySnapshot.docs[0];
      const data = existing.data();
      const maxMembers = data?.maxMembers || 4;
      if ((data?.memberCount ?? 0) >= maxMembers) {
        // Try the next one quickly
        const next = querySnapshot.docs.find((d) => (d.data()?.memberCount ?? 0) < (d.data()?.maxMembers || 4));
        if (next) return joinRoomById(next.id);
        return alert("No rooms available right now. Create a new one!");
      }
      return joinRoomById(existing.id);
    } else {
      const newDoc = await addDoc(roomsRef, {
        status: "active",
        memberCount: 1,
        members: me ? [{ uid: me.uid, name: me.name, joinedAt: Date.now() }] : [],
        maxMembers: 4,
        locked: false,
        bannedUids: [],
        admins: [],
        hostUid: me?.uid || null,
        createdByUid: me?.uid || null,
        timerEnd: Date.now() + 25 * 60 * 1000,
        createdBy: user.displayName
      });
      setRoomId(newDoc.id);
    }
  };

  // --- 4. ENGINE (Timer & Listeners) ---
  useEffect(() => {
    if (!roomData?.timerEnd || roomData?.status !== 'active') return;
    const interval = setInterval(() => {
      const distance = roomData.timerEnd - Date.now();
      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft("00:00 - Done!");
        // Mark the room as completed (only once; idempotent updates).
        updateDoc(doc(db, "rooms", roomId), {
          status: "ended",
          endedAt: roomData?.timerEnd || Date.now(),
          completion: "completed",
        }).catch(() => {});
      } else {
        const mins = Math.floor((distance / 1000 / 60) % 60);
        const secs = Math.floor((distance / 1000) % 60);
        setTimeLeft(`${mins}:${secs < 10 ? '0' + secs : secs}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [roomData]);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(doc(db, "rooms", roomId), (snapshot) => {
      const data = snapshot.data();
      if (data?.status === 'withered' && roomData?.status === 'active') {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); 
        osc.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 1);
      }
      setRoomData(data);
    });
    return () => unsub();
  }, [roomId, roomData]);

  useEffect(() => {
    if (!user || roomId) return;
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setInputCode(roomFromUrl);
      joinRoomById(roomFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roomId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && roomId && roomData?.status === 'active') {
        updateDoc(doc(db, "rooms", roomId), {
          status: "withered",
          witheredBy: user.displayName,
          endedAt: Date.now(),
          completion: "withered",
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [roomId, roomData, user]);

  const kickMember = async (uid) => {
    if (!roomId || !canManage || !uid) return;
    if (uid === roomData?.hostUid) return alert("You can't kick the host.");
    try {
      const roomRef = doc(db, "rooms", roomId);
      const member = roomData?.members?.find?.((m) => m?.uid === uid);
      if (!member) return;
      const newCount = Math.max(0, (roomData?.memberCount ?? roomData?.members?.length ?? 0) - 1);
      await updateDoc(roomRef, { members: arrayRemove(member), memberCount: newCount });
    } catch {
      alert("Couldn’t kick member. Try again.");
    }
  };

  const banMember = async (uid) => {
    if (!roomId || !canManage || !uid) return;
    if (uid === roomData?.hostUid) return alert("You can't ban the host.");
    try {
      const roomRef = doc(db, "rooms", roomId);
      const member = roomData?.members?.find?.((m) => m?.uid === uid);
      const updates = { bannedUids: arrayUnion(uid) };
      if (member) {
        const newCount = Math.max(0, (roomData?.memberCount ?? roomData?.members?.length ?? 0) - 1);
        updates.members = arrayRemove(member);
        updates.memberCount = newCount;
      }
      await updateDoc(roomRef, updates);
    } catch {
      alert("Couldn’t ban member. Try again.");
    }
  };

  const setLocked = async (locked) => {
    if (!roomId || !canManage) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), { locked: !!locked });
    } catch {
      alert("Couldn’t update lock setting.");
    }
  };

  const setMaxMembers = async (value) => {
    if (!roomId || !canManage) return;
    const next = Math.min(20, Math.max(2, Number(value) || 4));
    try {
      await updateDoc(doc(db, "rooms", roomId), { maxMembers: next });
    } catch {
      alert("Couldn’t update max members.");
    }
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      alert("Couldn’t copy link. You can copy it manually.");
    }
  };

  const formatLocalDateKey = (d) => {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const addDaysLocalKey = (dateKey, deltaDays) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return formatLocalDateKey(dt);
  };

  const recordFocusForUser = async ({ uid, name, roomId: rid, joinedAt, endedAt, outcome, createdByUid }) => {
    if (!uid || !rid) return;
    const endedMs = endedAt ?? Date.now();
    const joinedMs = joinedAt ?? endedMs;
    const durationMs = Math.max(0, endedMs - joinedMs);
    const durationMinutes = Math.floor(durationMs / 60000);

    const historyRef = doc(db, "users", uid, "history", rid);
    const existing = await getDoc(historyRef);
    if (existing.exists()) return; // Idempotency: only count once per room for the user.

    await setDoc(historyRef, {
      roomId: rid,
      uid,
      name: name || null,
      joinedAt: joinedMs,
      endedAt: endedMs,
      durationMs,
      durationMinutes,
      outcome, // "completed" | "withered" | "left"
      createdByUid: createdByUid || null,
      recordedAt: Date.now(),
    }, { merge: true });

    const statsRef = doc(db, "userStats", uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(statsRef);
      const current = snap.exists() ? snap.data() : {};

      const completedSessions = (current.completedSessions || 0) + (outcome === "completed" ? 1 : 0);
      const witheredSessions = (current.witheredSessions || 0) + (outcome === "withered" ? 1 : 0);
      const leftSessions = (current.leftSessions || 0) + (outcome === "left" ? 1 : 0);
      const roomsHosted = (current.roomsHosted || 0) + (createdByUid && createdByUid === uid ? 1 : 0);

      const totalFocusMinutes = (current.totalFocusMinutes || 0) + durationMinutes;

      let streakDays = current.streakDays || 0;
      let lastCompletedDateKey = current.lastCompletedDateKey || null;

      if (outcome === "completed") {
        const todayKey = formatLocalDateKey(endedMs);
        const lastKey = lastCompletedDateKey;
        const yesterdayKey = lastKey ? addDaysLocalKey(todayKey, -1) : null;

        if (lastKey === todayKey) {
          // Same day completion: keep streak as-is.
        } else if (yesterdayKey && lastKey === yesterdayKey) {
          streakDays = streakDays + 1;
        } else {
          streakDays = 1;
        }

        lastCompletedDateKey = todayKey;
      }

      tx.set(statsRef, {
        totalFocusMinutes,
        completedSessions,
        witheredSessions,
        leftSessions,
        roomsHosted,
        streakDays,
        lastCompletedDateKey,
        updatedAt: Date.now(),
      }, { merge: true });
    });
  };

  const recordRoomHistoryOnce = async (rid) => {
    const roomRef = doc(db, "rooms", rid);
    const txResult = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return { shouldRecord: false };
      const data = snap.data();
      if (data?.historyRecorded) return { shouldRecord: false };

      tx.update(roomRef, { historyRecorded: true, historyRecordedAt: Date.now() });
      return { shouldRecord: true, data };
    });

    if (!txResult?.shouldRecord) return;

    const data = txResult.data;
    const endedMs = data?.endedAt || data?.timerEnd || Date.now();
    const outcome = data?.status === "ended" ? "completed" : "withered";
    const createdByUid = data?.createdByUid || null;
    const members = Array.isArray(data?.members) ? data.members : [];

    for (const m of members) {
      await recordFocusForUser({
        uid: m?.uid,
        name: m?.name,
        roomId: rid,
        joinedAt: m?.joinedAt,
        endedAt: endedMs,
        outcome,
        createdByUid,
      });
    }
  };

  const leaveRoom = async () => {
    if (!roomId || !me) return;
    const confirmed = window.confirm("Leave this room?");
    if (!confirmed) return;

    try {
      const roomRef = doc(db, "rooms", roomId);
      const latestSnap = await getDoc(roomRef);
      const latest = latestSnap.data();
      const members = Array.isArray(latest?.members) ? latest.members : [];
      const myMember = members.find((m) => m?.uid === me.uid);

      // If we can't find the exact member object, fall back to just navigating away.
      if (!myMember) {
        setManageOpen(false);
        setRoomId(null);
        setRoomData(null);
        return;
      }

      const remaining = members.filter((m) => m?.uid !== me.uid);
      const nextCount = Math.max(0, (latest?.memberCount ?? members.length) - 1);

      // Record your partial focus immediately (so stats remain accurate even if you leave early).
      await recordFocusForUser({
        uid: me.uid,
        name: me.name,
        roomId: roomId,
        joinedAt: myMember?.joinedAt,
        endedAt: Date.now(),
        outcome: "left",
        createdByUid: latest?.createdByUid || null,
      });

      if (remaining.length === 0) {
        // Auto-close room if empty.
        try {
          await deleteDoc(roomRef);
        } catch {
          await updateDoc(roomRef, { status: "ended", memberCount: 0, members: [] });
        }
      } else {
        const updates = { members: arrayRemove(myMember), memberCount: nextCount };
        // Keep room manageable if host leaves.
        if (latest?.hostUid === me.uid) {
          const admins = Array.isArray(latest?.admins) ? latest.admins : [];
          const nextAdminUid = admins.find((uid) => remaining.some((m) => m?.uid === uid));
          // Promote an admin if possible; otherwise promote the next member.
          updates.hostUid = nextAdminUid || remaining[0].uid;
        }
        await updateDoc(roomRef, updates);
      }

      setManageOpen(false);
      setRoomId(null);
      setRoomData(null);
    } catch {
      alert("Couldn’t leave the room. Try again.");
    }
  };

  // When a session ends (completed/withered), record stats once for everyone still in the room.
  useEffect(() => {
    if (!roomId) return;
    if (!roomData?.status) return;
    if (roomData.historyRecorded) return;
    if (roomData.status !== "ended" && roomData.status !== "withered") return;
    recordRoomHistoryOnce(roomId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomData?.status, roomData?.historyRecorded]);

  if (!user) return <Login />;

  return (
    <div style={{ 
      textAlign: 'center', minHeight: '100vh', fontFamily: "'Inter', sans-serif", transition: '0.8s ease',
      background: theme.bg, color: theme.text, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(14px, 3.5vw, 24px)',
      width: '100%',
      '--vl-accent': theme.accent,
      '--vl-card': theme.card,
      '--vl-border': theme.border,
      '--vl-shadow': theme.shadow,
      '--vl-accentText': darkMode ? '#101a10' : '#ffffff',
    }}>
      <header className="vl-shell" style={{ maxWidth: '800px', display: 'flex', justifyContent: 'space-between', padding: 'clamp(12px, 3vw, 20px) 0', opacity: 0.7, gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span>👤 {user.displayName}</span>
          <button onClick={() => setDarkMode(!darkMode)} style={{ cursor: 'pointer', border: '1px solid ' + theme.border, background: 'none', color: theme.text, borderRadius: '20px', padding: '4px 10px' }}>{darkMode ? '☀️' : '🌙'}</button>
        </div>
        <button onClick={() => signOut(auth)} style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'gray' }}>Logout</button>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
        <h1 style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)', fontWeight: 800, marginBottom: 'clamp(18px, 5vw, 30px)', color: theme.accent, letterSpacing: '-1px', paddingInline: '8px' }}>Virtual Library 🌿</h1>

        {!roomId ? (
          <div className="vl-home">
            <div>
              <h2 className="vl-heroTitle" style={{ color: theme.accent }}>
                Study together.
                <br />
                Stay focused.
              </h2>
              <p className="vl-heroSubtitle">
                Start a 25‑minute session with up to 4 students. If anyone leaves the tab, the garden withers — keep it alive.
              </p>
              <div className="vl-badges" aria-label="Session highlights">
                <span className="vl-badge">⏱️ 25 min</span>
                <span className="vl-badge">👥 Up to 4</span>
                <span className="vl-badge">🌿 Stay on task</span>
              </div>
            </div>

            <div className="vl-card">
              <h3 className="vl-cardTitle">Start a session</h3>
              <p className="vl-cardHint">Jump into a new room, or paste a code to join friends.</p>

              <button onClick={joinRandomRoom} className="vl-primaryBtn">
                Begin New Session
              </button>

              <div className="vl-divider">OR JOIN</div>

              <div className="vl-row">
                <input
                  className="vl-input"
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Paste room code"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                />
                <button onClick={joinSpecificRoom} className="vl-secondaryBtn">
                  Join Room
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: '920px', display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
            <div style={{ width: '100%', maxWidth: '520px', justifySelf: 'center', padding: 'clamp(26px, 7vw, 50px) clamp(18px, 5vw, 30px)', background: theme.card, borderRadius: '40px', border: `1px solid ${theme.border}`, backdropFilter: 'blur(20px)', boxShadow: theme.shadow }}>
              <div style={{ fontSize: 'clamp(56px, 14vw, 90px)', marginBottom: '15px', filter: roomData?.status === 'withered' ? 'grayscale(1)' : 'none' }}>{getGardenEmoji()}</div>
              <h2 style={{ fontSize: 'clamp(2.6rem, 11vw, 4.5rem)', fontWeight: 800, margin: '0 0 20px 0', fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px', overflowWrap: 'anywhere' }}>{timeLeft}</h2>
              <div style={{ marginBottom: '18px', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '20px' }}>
                <p style={{ fontSize: '0.65rem', opacity: 0.5, letterSpacing: '2px', marginBottom: '8px', fontWeight: 700 }}>ROOM CODE</p>
                <code style={{ fontSize: '1.1rem', color: theme.accent }}>{roomId}</code>
              </div>
              <p style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.9 }}>
                👥 {roomData?.memberCount ?? roomData?.members?.length ?? 0} / {roomData?.maxMembers ?? 4} Students Joined
                {roomData?.locked ? ' • 🔒 Locked' : ''}
              </p>

              <div style={{ marginTop: '14px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={copyInvite}
                  style={{ padding: '10px 14px', borderRadius: '999px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.05)', color: theme.text, cursor: 'pointer', fontWeight: 700 }}
                >
                  {copied ? 'Copied!' : 'Copy invite link'}
                </button>
                <button
                  onClick={() => setManageOpen((v) => !v)}
                  style={{ padding: '10px 14px', borderRadius: '999px', border: `1px solid ${theme.accent}`, background: 'transparent', color: theme.accent, cursor: 'pointer', fontWeight: 800, opacity: canManage ? 1 : 0.55 }}
                  disabled={!canManage}
                  title={canManage ? 'Manage room' : 'Only host/admin can manage'}
                >
                  Manage room
                </button>
                <button
                  onClick={leaveRoom}
                  style={{ padding: '10px 14px', borderRadius: '999px', border: 'none', background: 'rgba(255, 82, 82, 0.18)', color: darkMode ? '#fecaca' : '#991b1b', cursor: 'pointer', fontWeight: 900 }}
                >
                  Leave room
                </button>
              </div>

              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.05)' }}>
                  <QRCodeCanvas value={inviteUrl || roomId} size={132} bgColor="rgba(255,255,255,0)" fgColor={darkMode ? "#e5e7eb" : "#14532d"} />
                  <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '8px' }}>Scan to join</div>
                </div>
              </div>

              {roomData?.status === 'ended' && (
                <div style={{ marginTop: '30px' }}>
                  <p style={{ color: darkMode ? '#a1ffb1' : '#166534', fontWeight: 800 }}>
                    🌳 Session completed. Great job!
                  </p>
                </div>
              )}
              {roomData?.status === 'withered' && (
                <div style={{ marginTop: '18px' }}>
                  <p style={{ color: '#ff5252', fontWeight: 700 }}>🥀 Withered by {roomData.witheredBy}</p>
                  <button onClick={() => window.location.reload()} style={{ marginTop: '12px', padding: '12px 30px', borderRadius: '15px', border: 'none', background: '#ff5252', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
                </div>
              )}

              {roomData?.status !== 'active' && (
                <div style={{ marginTop: '22px', padding: '16px', borderRadius: '22px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.05)' }}>
                  <div style={{ fontWeight: 900, letterSpacing: '-0.2px', marginBottom: '10px' }}>Your stats</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.03)' }}>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 800 }}>Focus this session</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 950, marginTop: '6px' }}>
                        {focusThisSessionMinutes !== null ? `${focusThisSessionMinutes} min` : '—'}
                      </div>
                    </div>
                    <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.03)' }}>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 800 }}>Streak</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 950, marginTop: '6px' }}>
                        {userStats?.streakDays ? `${userStats.streakDays} day(s)` : '—'}
                      </div>
                    </div>
                    <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.03)' }}>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 800 }}>Completion rate</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 950, marginTop: '6px' }}>
                        {completionRate !== null ? `${completionRate}%` : '—'}
                      </div>
                    </div>
                    <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.03)' }}>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 800 }}>Rooms hosted</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 950, marginTop: '6px' }}>
                        {userStats?.roomsHosted ?? 0}
                      </div>
                    </div>
                  </div>

                  {recentSessions?.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: '10px' }}>Recent sessions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recentSessions.slice(0, 4).map((h) => (
                          <div key={h.roomId} style={{ padding: '10px 12px', borderRadius: '16px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.03)', display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 850 }}>
                              {h.outcome === 'completed' ? '🌳 Completed' : h.outcome === 'withered' ? '🥀 Withered' : '👋 Left'}
                            </div>
                            <div style={{ opacity: 0.75, fontWeight: 750 }}>
                              {(h.durationMinutes ?? 0)} min
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {manageOpen && canManage && (
              <div style={{ width: '100%', maxWidth: '720px', justifySelf: 'center', padding: '18px', background: theme.card, borderRadius: '26px', border: `1px solid ${theme.border}`, backdropFilter: 'blur(20px)', boxShadow: theme.shadow }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900, letterSpacing: '-0.3px' }}>Room settings</div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                    Host: {roomData?.hostUid === me?.uid ? 'you' : 'someone else'}
                  </div>
                </div>

                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'start' }}>
                  <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.05)' }}>
                    <div style={{ fontWeight: 800, marginBottom: '8px' }}>Lock room</div>
                    <button
                      onClick={() => setLocked(!roomData?.locked)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '14px', border: `1px solid ${theme.border}`, background: roomData?.locked ? theme.accent : 'transparent', color: roomData?.locked ? (darkMode ? '#101a10' : '#fff') : theme.text, cursor: 'pointer', fontWeight: 900 }}
                    >
                      {roomData?.locked ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                    <div style={{ marginTop: '8px', fontSize: '0.85rem', opacity: 0.7 }}>
                      When locked, only host/admin can join.
                    </div>
                  </div>

                  <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.05)' }}>
                    <div style={{ fontWeight: 800, marginBottom: '8px' }}>Max members</div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="number"
                        min={2}
                        max={20}
                        value={roomData?.maxMembers ?? 4}
                        onChange={(e) => setMaxMembers(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '14px', border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, outline: 'none' }}
                      />
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '0.85rem', opacity: 0.7 }}>
                      Current: {roomData?.memberCount ?? roomData?.members?.length ?? 0}
                    </div>
                  </div>

                  <div style={{ padding: '12px', borderRadius: '18px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.05)' }}>
                    <div style={{ fontWeight: 800, marginBottom: '8px' }}>Members</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(roomData?.members || []).map((m) => (
                        <div key={m.uid} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', padding: '10px 10px', borderRadius: '14px', border: `1px solid ${theme.border}`, background: 'rgba(0,0,0,0.03)' }}>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                              {m.name || 'Student'}
                              {m.uid === roomData?.hostUid ? ' (host)' : ''}
                              {roomData?.admins?.includes?.(m.uid) ? ' (admin)' : ''}
                              {m.uid === me?.uid ? ' (you)' : ''}
                            </div>
                            <div style={{ fontSize: '0.78rem', opacity: 0.6 }}>{m.uid.slice(0, 8)}…</div>
                          </div>
                          {m.uid !== me?.uid && m.uid !== roomData?.hostUid && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => kickMember(m.uid)} style={{ padding: '8px 10px', borderRadius: '12px', border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, cursor: 'pointer', fontWeight: 800 }}>Kick</button>
                              <button onClick={() => banMember(m.uid)} style={{ padding: '8px 10px', borderRadius: '12px', border: 'none', background: '#ff5252', color: 'white', cursor: 'pointer', fontWeight: 900 }}>Ban</button>
                            </div>
                          )}
                        </div>
                      ))}
                      {(!roomData?.members || roomData.members.length === 0) && (
                        <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>No member list yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
