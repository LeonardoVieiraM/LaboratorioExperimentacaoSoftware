const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = 3000;

let db;

async function initializeDB() {
  db = await open({
    filename: './database/experimento.db',
    driver: sqlite3.Database
  });
}

// Middleware para logging de performance
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${duration}ms`);
  });
  next();
});

// GET /usuarios/:id
app.get('/usuarios/:id', async (req, res) => {
  try {
    const usuario = await db.get(
      'SELECT id, nome, email, cidade, data_cadastro, seguidores FROM usuarios WHERE id = ?',
      req.params.id
    );
    
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// GET /usuarios/:id/posts
app.get('/usuarios/:id/posts', async (req, res) => {
  try {
    const incluirComentarios = req.query.includeComments === 'true';
    
    const posts = await db.all(
      'SELECT id, titulo, conteudo, curtidas, data_post FROM posts WHERE usuario_id = ? ORDER BY data_post DESC LIMIT 20',
      req.params.id
    );
    
    if (incluirComentarios) {
      for (let post of posts) {
        const comentarios = await db.all(
          'SELECT id, usuario_id, texto, data_comentario FROM comentarios WHERE post_id = ? LIMIT 10',
          post.id
        );
        post.comentarios = comentarios;
      }
    }
    
    res.json(posts);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// GET /posts/:id/comentarios
app.get('/posts/:id/comentarios', async (req, res) => {
  try {
    const comentarios = await db.all(
      `SELECT c.id, c.texto, c.data_comentario, u.nome as usuario_nome 
       FROM comentarios c 
       JOIN usuarios u ON c.usuario_id = u.id 
       WHERE c.post_id = ? 
       ORDER BY c.data_comentario DESC 
       LIMIT 20`,
      req.params.id
    );
    
    res.json(comentarios);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// GET /dashboard/usuario/:id (dados agregados)
app.get('/dashboard/usuario/:id', async (req, res) => {
  try {
    const usuario = await db.get(
      'SELECT id, nome, email, seguidores FROM usuarios WHERE id = ?',
      req.params.id
    );
    
    const totalPosts = await db.get(
      'SELECT COUNT(*) as total FROM posts WHERE usuario_id = ?',
      req.params.id
    );
    
    const totalCurtidas = await db.get(
      'SELECT SUM(curtidas) as total FROM posts WHERE usuario_id = ?',
      req.params.id
    );
    
    const ultimosPosts = await db.all(
      'SELECT id, titulo, curtidas, data_post FROM posts WHERE usuario_id = ? ORDER BY data_post DESC LIMIT 5',
      req.params.id
    );
    
    res.json({
      ...usuario,
      total_posts: totalPosts.total,
      total_curtidas: totalCurtidas.total || 0,
      ultimos_posts: ultimosPosts
    });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Endpoint para health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', type: 'REST' });
});

initializeDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor REST rodando em http://localhost:${PORT}`);
    console.log(`Endpoints disponíveis:`);
    console.log(`  GET /usuarios/:id`);
    console.log(`  GET /usuarios/:id/posts?includeComments=true`);
    console.log(`  GET /posts/:id/comentarios`);
    console.log(`  GET /dashboard/usuario/:id`);
  });
});