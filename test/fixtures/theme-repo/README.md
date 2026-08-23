Imita um repositório de temas da Linx: vários temas irmãos na raiz, nenhum deles
com `Pages/` ou `html/`, e nenhum `manifest.xml` no clone inteiro.

`Base/widgets/easy.checkout/Templates/` existe de propósito: é a armadilha do
marcador mais interno. Quem parar nela faz `{% include /Templates/… %}` contar
da pasta errada.
