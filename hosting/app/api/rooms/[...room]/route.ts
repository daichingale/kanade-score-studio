import {env} from 'cloudflare:workers';
import {roomsAPI} from '../../../../../server/rooms.mjs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>roomsAPI(request,env.DB);
export const POST=(request:Request)=>roomsAPI(request,env.DB);
export const DELETE=(request:Request)=>roomsAPI(request,env.DB);
export const OPTIONS=(request:Request)=>roomsAPI(request,env.DB);
