import { useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup,
  GoogleAuthProvider,
  User 
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { useWebRTC } from "./hooks/useWebRTC";
import { Phone, PhoneOff, PhoneCall, User as UserIcon, LogOut, Copy, Check, Video } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [targetNumber, setTargetNumber] = useState("");
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const { 
    startCall, 
    acceptCall, 
    endCall, 
    rejectCall,
    localStream, 
    remoteStream, 
    callStatus,
    activeCallId 
  } = useWebRTC();

  // Auth & Profile Logic
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        const userDoc = doc(db, "users", user.uid);
        const snapshot = await getDoc(userDoc);
        
        if (!snapshot.exists()) {
          const num = Math.floor(100000 + Math.random() * 900000).toString();
          const profile = {
            uid: user.uid,
            number: num,
            status: "online",
            lastSeen: serverTimestamp()
          };
          await setDoc(userDoc, profile);
          setUserProfile(profile);
        } else {
          setUserProfile(snapshot.data());
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, "calls"), 
      where("calleeId", "==", user.uid), 
      where("status", "==", "ringing")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setIncomingCall({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setIncomingCall(null);
      }
    });
    
    return () => unsubscribe();
  }, [user]);

  const copyNumber = () => {
    if (userProfile?.number) {
      navigator.clipboard.writeText(userProfile.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user || !userProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white font-sans p-6 text-center" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md space-y-8"
        >
          <div className="w-20 h-20 bg-orange-500 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/20 mb-8">
            <Phone className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold">مرحباً بك في اتصل بي</h1>
          <p className="text-neutral-400">سجل دخولك للحصول على رقمك الخاص والبدء في إجراء مكالمات مجانية مع أصدقائك.</p>
          
          <button 
            onClick={login}
            className="w-full bg-white text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-xl"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            التسجيل عبر جوجل
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-orange-500/30 overflow-hidden relative border-amber-950" dir="rtl">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-neutral-800/20 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-10 p-6 flex justify-between items-center max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Phone className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">اتصل بي</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">بواسطة</span>
            <span className="text-sm font-medium">{userProfile.number}</span>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-lg mx-auto px-6 pt-12 pb-24">
        {callStatus === 'idle' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            <div className="text-center space-y-4">
              <h2 className="text-4xl lg:text-5xl font-bold leading-tight">ابدأ مكالمتك الآن</h2>
              <p className="text-neutral-400">أدخل رقم صديقك المكون من 6 أرقام للاتصال به فوراً.</p>
            </div>

            <div className="space-y-6">
              <div className="relative">
                <input 
                  type="text" 
                  maxLength={6}
                  value={targetNumber}
                  onChange={(e) => setTargetNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full bg-neutral-900/50 border border-neutral-800 rounded-2xl px-6 py-8 text-4xl text-center font-mono tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all placeholder:text-neutral-800"
                />
                <div className="absolute -top-3 left-6 px-2 bg-neutral-950 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">رقم الصديق</div>
              </div>

              <button 
                onClick={() => targetNumber.length === 6 && startCall(targetNumber)}
                disabled={targetNumber.length !== 6}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-800 disabled:text-neutral-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl shadow-orange-500/10 active:scale-[0.98]"
              >
                <PhoneCall className="w-6 h-6" />
                اتصال الآن
              </button>
            </div>

            <div className="pt-8 grid grid-cols-2 gap-4">
              <div className="bg-neutral-900/40 p-6 rounded-3xl border border-neutral-800 group hover:border-orange-500/30 transition-all cursor-pointer" onClick={copyNumber}>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">رقمك</span>
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-neutral-600 group-hover:text-orange-500" />}
                </div>
                <div className="text-2xl font-mono tracking-wider">{userProfile.number}</div>
              </div>
              <div className="bg-neutral-900/40 p-6 rounded-3xl border border-neutral-800 flex flex-col justify-center items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">متصل</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            {/* Call UI */}
            <div className="flex-1 relative overflow-hidden">
              {/* Remote Video (Main) */}
              <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center">
                {remoteStream && (
                  <video 
                    ref={(v) => v && (v.srcObject = remoteStream)} 
                    autoPlay 
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 z-10 bg-black/40 backdrop-blur-sm pointer-events-none">
                  {callStatus === 'calling' || callStatus === 'ringing' ? (
                    <>
                      <div className="w-24 h-24 rounded-full bg-orange-500 flex items-center justify-center animate-bounce shadow-2xl shadow-orange-500/50">
                        <PhoneCall className="w-10 h-10" />
                      </div>
                      <div className="text-center space-y-2">
                        <h3 className="text-2xl font-bold">جاري الاتصال...</h3>
                        <p className="text-neutral-400 font-mono tracking-widest">{activeCallId && incomingCall?.callerNumber ? incomingCall.callerNumber : targetNumber}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Local Video (Floating) */}
              <motion.div 
                drag
                dragConstraints={{ top: 20, right: 20, bottom: 20, left: 20 }}
                className="absolute top-10 left-10 w-32 h-44 bg-neutral-800 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl z-40 cursor-move"
              >
                {localStream && (
                  <video 
                    ref={(v) => v && (v.srcObject = localStream)} 
                    autoPlay 
                    muted 
                    className="w-full h-full object-cover grayscale brightness-125"
                  />
                )}
              </motion.div>
            </div>

            {/* Controls */}
            <div className="p-12 pb-24 flex justify-center items-center gap-10 bg-gradient-to-t from-black via-black/80 to-transparent">
              <button className="w-16 h-16 rounded-full bg-neutral-800/80 hover:bg-neutral-700/80 border border-white/10 flex items-center justify-center transition-all">
                <Video className="w-7 h-7" />
              </button>
              <button 
                onClick={endCall}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 shadow-2xl shadow-red-500/30 flex items-center justify-center transition-all active:scale-90"
              >
                <PhoneOff className="w-8 h-8" />
              </button>
              <button className="w-16 h-16 rounded-full bg-neutral-800/80 hover:bg-neutral-700/80 border border-white/10 flex items-center justify-center transition-all">
                <UserIcon className="w-7 h-7" />
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Incoming Call Overlay */}
      <AnimatePresence>
        {incomingCall && callStatus === 'idle' && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-6 right-6 z-[60] max-w-md mx-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center animate-pulse">
                <Phone className="w-7 h-7" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-orange-500 tracking-widest">مكالمة واردة</span>
                <span className="text-xl font-bold tracking-tight">{incomingCall.callerNumber}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => rejectCall(incomingCall.id)}
                className="p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <button 
                onClick={() => acceptCall(incomingCall.id)}
                className="p-4 rounded-2xl bg-green-500/10 hover:bg-green-500/20 text-green-500 transition-colors"
              >
                <Phone className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Meta */}
      <footer className="fixed bottom-6 left-0 right-0 z-10 flex justify-center pointer-events-none px-6">
        <div className="bg-neutral-900/80 backdrop-blur-md px-6 py-2 rounded-full border border-neutral-800 text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold">
          نظام تشفير الطرفين مفعل • 2026
        </div>
      </footer>
    </div>
  );
}
