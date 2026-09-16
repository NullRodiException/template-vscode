Imita um repositório de temas da Linx: vários temas irmãos na raiz, nenhum deles
com `Pages/` ou `html/`, e nenhum `manifest.xml` no clone inteiro.

`Base/widgets/easy.checkout/Templates/` existe de propósito: é a armadilha do
marcador mais interno. Quem parar nela faz `{% include /Templates/… %}` contar
da pasta errada.

`Moda/` e `agrada-template-clean/` não têm nenhum desses marcadores: quem as
identifica como raiz é o **nome da pasta** — o primeiro pelo nome padrão da
Linx, o segundo só quando entra em `linxLiquid.themeFolders`. `Shared/` dentro
de `agrada-template-clean/` é a armadilha do nome mais interno.
