const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { faker } = require('@faker-js/faker');

async function initializeDatabase() {
  const db = await open({
    filename: './database/experimento.db',
    driver: sqlite3.Database
  });

  // Criar tabelas
  await db.exec(`
    DROP TABLE IF EXISTS comentarios;
    DROP TABLE IF EXISTS posts;
    DROP TABLE IF EXISTS usuarios;
    
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      email TEXT,
      cidade TEXT,
      data_cadastro TEXT,
      seguidores INTEGER
    );
    
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      titulo TEXT,
      conteudo TEXT,
      curtidas INTEGER,
      data_post TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    
    CREATE TABLE comentarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      usuario_id INTEGER,
      texto TEXT,
      data_comentario TEXT,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
  `);

  // Popular com dados
  const usuarios = [];
  const posts = [];
  const comentarios = [];

  console.log('Gerando dados...');

  // Gerar 500 usuários
  for (let i = 1; i <= 500; i++) {
    const usuario = {
      nome: faker.person.fullName(),
      email: faker.internet.email(),
      cidade: faker.location.city(),
      data_cadastro: faker.date.past({ years: 2 }).toISOString(),
      seguidores: Math.floor(Math.random() * 10000)
    };
    
    const result = await db.run(
      'INSERT INTO usuarios (nome, email, cidade, data_cadastro, seguidores) VALUES (?, ?, ?, ?, ?)',
      [usuario.nome, usuario.email, usuario.cidade, usuario.data_cadastro, usuario.seguidores]
    );
    usuarios.push({ id: result.lastID, ...usuario });
  }

  // Gerar 5000 posts (aprox. 10 por usuário)
  for (let i = 1; i <= 5000; i++) {
    const usuarioId = Math.floor(Math.random() * 500) + 1;
    const post = {
      usuario_id: usuarioId,
      titulo: faker.lorem.sentence(),
      conteudo: faker.lorem.paragraphs({ min: 1, max: 3 }),
      curtidas: Math.floor(Math.random() * 5000),
      data_post: faker.date.recent({ days: 180 }).toISOString()
    };
    
    const result = await db.run(
      'INSERT INTO posts (usuario_id, titulo, conteudo, curtidas, data_post) VALUES (?, ?, ?, ?, ?)',
      [post.usuario_id, post.titulo, post.conteudo, post.curtidas, post.data_post]
    );
    posts.push({ id: result.lastID, ...post });
  }

  // Gerar 15000 comentários (aprox. 3 por post)
  for (let i = 1; i <= 15000; i++) {
    const postId = Math.floor(Math.random() * 5000) + 1;
    const usuarioId = Math.floor(Math.random() * 500) + 1;
    const comentario = {
      post_id: postId,
      usuario_id: usuarioId,
      texto: faker.lorem.sentence(),
      data_comentario: faker.date.recent({ days: 90 }).toISOString()
    };
    
    await db.run(
      'INSERT INTO comentarios (post_id, usuario_id, texto, data_comentario) VALUES (?, ?, ?, ?)',
      [comentario.post_id, comentario.usuario_id, comentario.texto, comentario.data_comentario]
    );
    comentarios.push(comentario);
  }

  console.log(`Base populada: ${usuarios.length} usuários, ${posts.length} posts, ${comentarios.length} comentários`);
  
  // Criar índices para performance
  await db.exec(`
    CREATE INDEX idx_posts_usuario ON posts(usuario_id);
    CREATE INDEX idx_comentarios_post ON comentarios(post_id);
    CREATE INDEX idx_comentarios_usuario ON comentarios(usuario_id);
  `);

  await db.close();
  console.log('Database inicializada com sucesso!');
}

initializeDatabase().catch(console.error);