// Definição das consultas equivalentes para REST e GraphQL

const consultas = [
  {
    id: 1,
    nome: "Dados básicos de usuário",
    descricao: "Buscar informações básicas de um único usuário",
    rest: {
      method: 'GET',
      endpoint: (id) => `/usuarios/${id}`,
      params: {}
    },
    graphql: {
      query: (id) => `
        query {
          usuario(id: ${id}) {
            id
            nome
            email
            cidade
            seguidores
          }
        }
      `
    }
  },
  
  {
    id: 2,
    nome: "Posts de usuário sem comentários",
    descricao: "Listar posts de um usuário (sem detalhes de comentários)",
    rest: {
      method: 'GET',
      endpoint: (id) => `/usuarios/${id}/posts?includeComments=false`,
      params: {}
    },
    graphql: {
      query: (id) => `
        query {
          postsDoUsuario(usuarioId: ${id}, includeComments: false) {
            id
            titulo
            curtidas
            data_post
          }
        }
      `
    }
  },
  
  {
    id: 3,
    nome: "Posts de usuário com comentários",
    descricao: "Listar posts de um usuário incluindo todos os comentários",
    rest: {
      method: 'GET',
      endpoint: (id) => `/usuarios/${id}/posts?includeComments=true`,
      params: {}
    },
    graphql: {
      query: (id) => `
        query {
          postsDoUsuario(usuarioId: ${id}, includeComments: true) {
            id
            titulo
            curtidas
            data_post
            comentarios(limit: 10) {
              id
              texto
              data_comentario
            }
          }
        }
      `
    }
  },
  
  {
    id: 4,
    nome: "Dashboard completo do usuário",
    descricao: "Dados agregados + últimos posts",
    rest: {
      method: 'GET',
      endpoint: (id) => `/dashboard/usuario/${id}`,
      params: {}
    },
    graphql: {
      query: (id) => `
        query {
          dashboardUsuario(id: ${id}) {
            id
            nome
            email
            seguidores
            total_posts
            total_curtidas
            ultimos_posts(limit: 5) {
              id
              titulo
              curtidas
              data_post
            }
          }
        }
      `
    }
  },
  
  {
    id: 5,
    nome: "Comentários de um post específico",
    descricao: "Buscar todos os comentários de um post com dados do autor",
    rest: {
      method: 'GET',
      endpoint: (postId) => `/posts/${postId}/comentarios`,
      params: {}
    },
    graphql: {
      query: (postId) => `
        query {
          comentariosDoPost(postId: ${postId}) {
            id
            texto
            data_comentario
            usuario {
              id
              nome
            }
          }
        }
      `
    }
  }
];

// IDs aleatórios para testes
const usuariosIds = [1, 42, 87, 123, 256, 389, 410, 450, 487, 500];
const postsIds = [100, 500, 1000, 2000, 3000, 4000, 4500, 4800, 4950, 4999];

function getRandomUsuarioId() {
  return usuariosIds[Math.floor(Math.random() * usuariosIds.length)];
}

function getRandomPostId() {
  return postsIds[Math.floor(Math.random() * postsIds.length)];
}

// Gerar cenários de teste combinando consultas com IDs
function gerarCenariosTeste() {
  const cenarios = [];
  
  for (let i = 0; i < 500; i++) { // N repetições por tipo de consulta
    for (const consulta of consultas) {
      let id;
      if (consulta.id === 5) {
        id = getRandomPostId();
      } else {
        id = getRandomUsuarioId();
      }
      
      cenarios.push({
        id_consulta: consulta.id,
        nome_consulta: consulta.nome,
        id_param: id,
        rest: {
          url: `http://localhost:3000${consulta.rest.endpoint(id)}`,
          method: consulta.rest.method
        },
        graphql: {
          url: 'http://localhost:3001/graphql',
          method: 'POST',
          data: {
            query: consulta.graphql.query(id)
          }
        }
      });
    }
  }
  
  return cenarios;
}

module.exports = {
  consultas,
  usuariosIds,
  postsIds,
  getRandomUsuarioId,
  getRandomPostId,
  gerarCenariosTeste
};