'use client';
import {createContext,useContext,useState,useEffect,useCallback,ReactNode} from 'react';
type State={user:{name:string;email:string};cart:string[];owned:{product_id:string;mode:string}[];orders:any[];requests:any[];progress:{product_id:string;completed:string}[];stripeReady:boolean};
type Account={data:State|null;loading:boolean;error:string;refresh:()=>Promise<void>;post:(action:string,body:unknown)=>Promise<any>};
const Context=createContext<Account>(null!);
export function AccountProvider({children}:{children:ReactNode}){
 const [data,setData]=useState<State|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{try{const r=await fetch('/api/state',{cache:'no-store'});const d:any=await r.json();if(!r.ok)throw new Error(d.error);setData(d);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load your classroom.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();const handle=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',handle);window.addEventListener('focus',handle);return()=>{document.removeEventListener('visibilitychange',handle);window.removeEventListener('focus',handle);};},[refresh]);
 async function post(action:string,body:unknown){const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d:any=await r.json();if(!r.ok)throw new Error(d.error||'Request failed. Please try again.');await refresh();return d;}
 return <Context.Provider value={{data,loading,error,refresh,post}}>{children}</Context.Provider>
}
export const useAccount=()=>useContext(Context);
