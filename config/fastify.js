import fastifyView from '@fastify/view'
import fastifyFormbody from '@fastify/formbody'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import fastifyMultipart from '@fastify/multipart'
import ejs from 'ejs'
import path from 'path'

export async function registerPlugins(server) {
  // Arquivos estáticos
  server.register(fastifyStatic, {
    root: path.join(process.cwd(), 'app', 'static'),
    prefix: '/static/',
    decorateReply: false
  })

  // Formulário POST
  server.register(fastifyFormbody)

  // Upload de arquivos
  server.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024 }
  })

  // Views com EJS
  server.register(fastifyView, {
    engine: { ejs },
    root: path.join(process.cwd(), 'app', 'views'),
    layout: false
  })

  // Cookies
  server.register(fastifyCookie, {
    secret: process.env.SESSION_SECRET,
    parseOptions: {}
  })
  
  // JWT configurado para ler cookie
  server.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    cookie: {
      cookieName: 'token',
      signed: false
    }
  })
}
