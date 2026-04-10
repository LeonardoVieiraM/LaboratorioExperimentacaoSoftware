# Qualidade de Repositórios Java com GraphQL

## Descrição
Este projeto utiliza Python, a API GraphQL do GitHub e a ferramenta CK para coletar e analisar métricas de processo e de qualidade de repositórios escritos em Java. O objetivo é extrair dados relevantes como idade, estrelas, releases, LOC, CBO, DIT e LCOM.

## Métricas de Qualidade
Este projeto analisa as seguintes métricas de qualidade de software:

- **CBO (Coupling Between Objects - Acoplamento Entre Objetos)**: Mede o nível de dependência entre classes. Um CBO alto pode indicar um código fortemente acoplado, o que reduz a modularidade e dificulta a manutenção.
- **DIT (Depth of Inheritance Tree - Profundidade da Árvore de Herança)**: Representa a profundidade de uma classe na hierarquia de herança. Valores altos podem indicar maior complexidade e maior reutilização de código, mas também podem aumentar a dificuldade de compreensão e manutenção.
- **LCOM (Lack of Cohesion of Methods - Falta de Coesão dos Métodos)**: Mede a coesão dentro de uma classe. Um LCOM alto indica que a classe possui métodos que operam em subconjuntos diferentes dos atributos da classe, sugerindo que ela pode estar realizando múltiplas responsabilidades e pode precisar ser refatorada.
- **LOC (Lines of Code - Linhas de Código)**: Indica o tamanho do código-fonte em termos de linhas de código, sendo uma métrica geral usada para avaliar a complexidade e o esforço necessário para manutenção.
