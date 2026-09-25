import Site from '../site';
import {notFound} from 'next/navigation';
import {findProduct,subjects} from '@/lib/catalog';
const sections=['curriculum','course','solutions','pricing','about','help','privacy','cart','library','learn','request','checkout','school'];
export async function generateMetadata({params}:{params:Promise<{path:string[]}>}){const {path}=await params;const p=['course','learn'].includes(path[0])?findProduct(path[1]):null;return {title:(p?.title??path[0].charAt(0).toUpperCase()+path[0].slice(1))+' | SwIRL'};}
export default async function Page({params}:{params:Promise<{path:string[]}>}){const {path}=await params;if(!sections.includes(path[0])||path.length>2)notFound();if(['course','learn'].includes(path[0])&&!findProduct(path[1]))notFound();if(path[0]==='curriculum'&&path[1]&&!subjects.some(s=>s.id===path[1]))notFound();if(path[1]&&!['course','learn','curriculum','solutions'].includes(path[0]))notFound();if(path[0]==='solutions'&&path[1]&&!['daycare','afterschool','camp','families'].includes(path[1]))notFound();return <Site path={path}/>;}
