import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  getDoc,
  serverTimestamp,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTC() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected' | 'ended'>('idle');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  
  const pc = useRef<RTCPeerConnection | null>(null);

  // Initialize WebRTC
  const init = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const remote = new MediaStream();
    
    const peerConnection = new RTCPeerConnection(servers);
    
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remote.addTrack(track);
      });
    };

    setLocalStream(stream);
    setRemoteStream(remote);
    pc.current = peerConnection;
    return { stream, remote, peerConnection };
  };

  // Create call (Caller)
  const startCall = async (calleeNumber: string) => {
    try {
      const { peerConnection } = await init();
      const callDoc = doc(collection(db, 'calls'));
      const candidateCollection = collection(callDoc, 'iceCandidates');

      // Find user by number
      const userQuery = query(collection(db, 'users'), where('number', '==', calleeNumber));
      const userSnapshot = await getDocs(userQuery);
      if (userSnapshot.empty) {
        throw new Error('User not found');
      }
      const calleeId = userSnapshot.docs[0].id;

      setActiveCallId(callDoc.id);
      setCallStatus('calling');

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(candidateCollection, {
            candidate: event.candidate.toJSON(),
            type: 'caller',
            createdAt: serverTimestamp(),
          });
        }
      };

      const offerDescription = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offerDescription);

      const offer = {
        type: offerDescription.type,
        sdp: offerDescription.sdp,
      };

      await setDoc(callDoc, {
        callerId: auth.currentUser?.uid,
        callerNumber: (await getDoc(doc(db, 'users', auth.currentUser!.uid))).data()?.number,
        calleeId,
        calleeNumber,
        offer,
        status: 'ringing',
        createdAt: serverTimestamp(),
      });

      // Listen for answer
      onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          peerConnection.setRemoteDescription(answerDescription);
          setCallStatus('connected');
        }
        if (data?.status === 'ended' || data?.status === 'rejected') {
          endCall();
        }
      });

      // Listen for ICE candidates from callee
      onSnapshot(candidateCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.type === 'callee') {
              peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
          }
        });
      });

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'calls');
    }
  };

  // Accept call (Callee)
  const acceptCall = async (callId: string) => {
    try {
      const { peerConnection } = await init();
      const callDoc = doc(db, 'calls', callId);
      const candidateCollection = collection(callDoc, 'iceCandidates');

      setActiveCallId(callId);
      setCallStatus('connected');

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(candidateCollection, {
            candidate: event.candidate.toJSON(),
            type: 'callee',
            createdAt: serverTimestamp(),
          });
        }
      };

      const callSnapshot = await getDoc(callDoc);
      const callData = callSnapshot.data();
      const offerDescription = new RTCSessionDescription(callData?.offer);
      await peerConnection.setRemoteDescription(offerDescription);

      const answerDescription = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answerDescription);

      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      };

      await updateDoc(callDoc, { answer, status: 'accepted' });

      // Listen for ICE candidates from caller
      onSnapshot(candidateCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.type === 'caller') {
              peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
          }
        });
      });

      // Listen for call end
      onSnapshot(callDoc, (snapshot) => {
        if (snapshot.data()?.status === 'ended') {
          endCall();
        }
      });

    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
    }
  };

  const endCall = async () => {
    if (activeCallId) {
      const callDoc = doc(db, 'calls', activeCallId);
      await updateDoc(callDoc, { status: 'ended' }).catch(() => {});
    }
    
    pc.current?.close();
    localStream?.getTracks().forEach(track => track.stop());
    
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('idle');
    setActiveCallId(null);
    pc.current = null;
  };

  const rejectCall = async (callId: string) => {
    const callDoc = doc(db, 'calls', callId);
    await updateDoc(callDoc, { status: 'rejected' });
  };

  return {
    startCall,
    acceptCall,
    endCall,
    rejectCall,
    localStream,
    remoteStream,
    callStatus,
    activeCallId
  };
}
