const express = require('express');
const expressGraphQL = require('express-graphql');
const graphqlHTTP = typeof expressGraphQL === 'function' 
  ? expressGraphQL 
  : expressGraphQL.graphqlHTTP;const { buildSchema } = require('graphql');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = 3001;

let db;

async function initializeDB() {
  db = await open({
    filename: './database/experimento.db',
    driver: sqlite3.Database
  });
}

// Schema GraphQL
const schema = buildSchema(`
  type Usuario {
    id: ID!
    nome: String!
    email: String!
    cidade: String!
    data_cadastro: String!
    seguidores: Int!
    posts(limit: Int): [Post!]!
    total_posts: Int!
    total_curtidas: Int!
  }
  
  type Post {
    id: ID!
    titulo: String!
    conteudo: String!
    curtidas: Int!
    data_post: String!
    comentarios(limit: Int): [Comentario!]!
    usuario: Usuario!
  }
  
  type Comentario {
    id: ID!
    texto: String!
    data_comentario: String!
    usuario: Usuario!
  }
  
  type DashboardUsuario {
    id: ID!
    nome: String!
    email: String!
    seguidores: Int!
    total_posts: Int!
    total_curtidas: Int!
    ultimos_posts(limit: Int): [Post!]!
  }
  
  type Query {
    usuario(id: ID!): Usuario
    postsDoUsuario(usuarioId: ID!, includeComments: Boolean): [Post!]!
    comentariosDoPost(postId: ID!): [Comentario!]!
    dashboardUsuario(id: ID!): DashboardUsuario
  }
`);

// Resolvers
const root = {
  usuario: async ({ id }) => {
    const usuario = await db.get(
      'SELECT id, nome, email, cidade, data_cadastro, seguidores FROM usuarios WHERE id = ?',
      id
    );
    if (!usuario) return null;
    
    // Adicionar métodos resolvidos
    usuario.posts = async ({ limit = 20 }) => {
      return await db.all(
        'SELECT id, titulo, conteudo, curtidas, data_post FROM posts WHERE usuario_id = ? ORDER BY data_post DESC LIMIT ?',
        [usuario.id, limit]
      );
    };
    
    usuario.total_posts = async () => {
      const result = await db.get('SELECT COUNT(*) as total FROM posts WHERE usuario_id = ?', usuario.id);
      return result.total;
    };
    
    usuario.total_curtidas = async () => {
      const result = await db.get('SELECT SUM(curtidas) as total FROM posts WHERE usuario_id = ?', usuario.id);
      return result.total || 0;
    };
    
    return usuario;
  },
  
  postsDoUsuario: async ({ usuarioId, includeComments }) => {
    const posts = await db.all(
      'SELECT id, titulo, conteudo, curtidas, data_post FROM posts WHERE usuario_id = ? ORDER BY data_post DESC LIMIT 20',
      usuarioId
    );
    
    if (includeComments) {
      for (let post of posts) {
        post.comentarios = async ({ limit = 10 }) => {
          return await db.all(
            'SELECT id, texto, data_comentario FROM comentarios WHERE post_id = ? LIMIT ?',
            [post.id, limit]
          );
        };
      }
    }
    
    return posts;
  },
  
  comentariosDoPost: async ({ postId }) => {
    // Busca os dados do comentário e do usuário em uma única Query
    const dados = await db.all(
      `SELECT c.id as comentario_id, c.texto, c.data_comentario, 
              u.id as usuario_id, u.nome as usuario_nome
       FROM comentarios c 
       JOIN usuarios u ON c.usuario_id = u.id
       WHERE c.post_id = ? 
       ORDER BY c.data_comentario DESC 
       LIMIT 20`,
      postId
    );
    
    return dados.map(linha => ({
      id: linha.comentario_id,
      texto: linha.texto,
      data_comentario: linha.data_comentario,
      usuario: {
        id: linha.usuario_id,
        nome: linha.usuario_nome
      }
    }));
  },
  
  dashboardUsuario: async ({ id }) => {
    const usuario = await db.get(
      'SELECT id, nome, email, seguidores FROM usuarios WHERE id = ?',
      id
    );
    
    const totalPosts = await db.get(
      'SELECT COUNT(*) as total FROM posts WHERE usuario_id = ?',
      id
    );
    
    const totalCurtidas = await db.get(
      'SELECT SUM(curtidas) as total FROM posts WHERE usuario_id = ?',
      id
    );
    
    usuario.total_posts = totalPosts.total;
    usuario.total_curtidas = totalCurtidas.total || 0;
    
    usuario.ultimos_posts = async ({ limit = 5 }) => {
      return await db.all(
        'SELECT id, titulo, curtidas, data_post FROM posts WHERE usuario_id = ? ORDER BY data_post DESC LIMIT ?',
        [id, limit]
      );
    };
    
    return usuario;
  }
};

// Middleware para logging
app.use('/graphql', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`GraphQL query - ${duration}ms`);
  });
  next();
});

app.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true, // Interface para testes
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', type: 'GraphQL' });
});

initializeDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor GraphQL rodando em http://localhost:${PORT}/graphql`);
    console.log(`GraphiQL disponível para testes`);
  });
});