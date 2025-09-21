import path from 'path'

export default async function dashboardRoutes(server, req) {
    server.get('/dashboard', async (request, reply) => {
        const currentPage = request.query.page || 'default'
        try {
            return reply.view(
                path.join(process.cwd(), 'app', 'views', 'dashboardAdmin.ejs'),
                {
                    user: { nome: req.user.nome }, 
                    currentPage: currentPage,
                }
            )
        } catch (err) {
            server.log.error(err)
            return reply.code(500).send('Erro ao carregar o painel de controle.')
        }
    })
}