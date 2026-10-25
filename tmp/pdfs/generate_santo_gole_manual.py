from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "manual-de-uso-santo-gole.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#10243A")
NAVY_2 = colors.HexColor("#1C3448")
ORANGE = colors.HexColor("#F15A2A")
ORANGE_DARK = colors.HexColor("#D84315")
ORANGE_PALE = colors.HexColor("#FFF1EB")
TEAL = colors.HexColor("#008F80")
TEAL_PALE = colors.HexColor("#E8F6F3")
AMBER = colors.HexColor("#9A6500")
AMBER_PALE = colors.HexColor("#FFF7DF")
RED = colors.HexColor("#A63D35")
RED_PALE = colors.HexColor("#FFF0EE")
INK = colors.HexColor("#172334")
MUTED = colors.HexColor("#66758A")
LIGHT = colors.HexColor("#F4F6F8")
LINE = colors.HexColor("#DCE2E8")
WHITE = colors.white


def register_fonts():
    candidates = [
        (
            Path("C:/Windows/Fonts/segoeui.ttf"),
            Path("C:/Windows/Fonts/segoeuib.ttf"),
            Path("C:/Windows/Fonts/segoeuii.ttf"),
        ),
        (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/ariali.ttf"),
        ),
    ]
    for regular, bold, italic in candidates:
        if regular.exists() and bold.exists() and italic.exists():
            pdfmetrics.registerFont(TTFont("SG-Regular", str(regular)))
            pdfmetrics.registerFont(TTFont("SG-Bold", str(bold)))
            pdfmetrics.registerFont(TTFont("SG-Italic", str(italic)))
            return "SG-Regular", "SG-Bold", "SG-Italic"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


FONT, FONT_BOLD, FONT_ITALIC = register_fonts()


class ManualDocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "ChapterTitle":
            text = flowable.getPlainText()
            key = f"chapter-{self.seq.nextf('chapter')}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=0, closed=False)
            self.notify("TOCEntry", (0, text, self.page, key))


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverEyebrow",
        fontName=FONT_BOLD,
        fontSize=10,
        leading=13,
        textColor=ORANGE,
        tracking=1.4,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        fontName=FONT_BOLD,
        fontSize=31,
        leading=34,
        textColor=WHITE,
        spaceAfter=12,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubtitle",
        fontName=FONT,
        fontSize=13,
        leading=19,
        textColor=colors.HexColor("#D9E2EA"),
        spaceAfter=18,
    )
)
styles.add(
    ParagraphStyle(
        name="ChapterTitle",
        fontName=FONT_BOLD,
        fontSize=23,
        leading=27,
        textColor=NAVY,
        spaceBefore=0,
        spaceAfter=8,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="ChapterIntro",
        fontName=FONT,
        fontSize=11,
        leading=16,
        textColor=MUTED,
        spaceAfter=15,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionHeading",
        fontName=FONT_BOLD,
        fontSize=12.2,
        leading=15,
        textColor=NAVY_2,
        spaceBefore=9,
        spaceAfter=7,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="BodySG",
        fontName=FONT,
        fontSize=9.8,
        leading=14.1,
        textColor=INK,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="BodySmall",
        fontName=FONT,
        fontSize=8.7,
        leading=12.3,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="CardTitle",
        fontName=FONT_BOLD,
        fontSize=10,
        leading=13,
        textColor=NAVY,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHeader",
        fontName=FONT_BOLD,
        fontSize=9,
        leading=12,
        textColor=WHITE,
    )
)
styles.add(
    ParagraphStyle(
        name="CardBody",
        fontName=FONT,
        fontSize=8.7,
        leading=12.3,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="StepNumber",
        fontName=FONT_BOLD,
        fontSize=10,
        leading=12,
        alignment=TA_CENTER,
        textColor=WHITE,
    )
)
styles.add(
    ParagraphStyle(
        name="StepBody",
        fontName=FONT,
        fontSize=9.5,
        leading=13.6,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="CalloutTitle",
        fontName=FONT_BOLD,
        fontSize=9.4,
        leading=12,
        textColor=NAVY,
        spaceAfter=2,
    )
)
styles.add(
    ParagraphStyle(
        name="CalloutBody",
        fontName=FONT,
        fontSize=8.9,
        leading=12.7,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="TOCTitle",
        fontName=FONT_BOLD,
        fontSize=23,
        leading=27,
        textColor=NAVY,
        spaceAfter=16,
    )
)
styles.add(
    ParagraphStyle(
        name="TOCLevel0",
        fontName=FONT,
        fontSize=10,
        leading=16,
        textColor=INK,
        leftIndent=0,
        firstLineIndent=0,
        spaceBefore=2,
    )
)


def p(text, style="BodySG"):
    return Paragraph(text, styles[style])


def bullets(items):
    return ListFlowable(
        [ListItem(p(escape(item), "BodySG"), leftIndent=12) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=16,
        bulletFontName=FONT_BOLD,
        bulletFontSize=7,
        bulletColor=ORANGE,
        spaceAfter=6,
    )


def steps(items):
    rows = []
    for index, item in enumerate(items, 1):
        number = Table(
            [[Paragraph(str(index), styles["StepNumber"])]],
            colWidths=[7 * mm],
            rowHeights=[7 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), ORANGE),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BOX", (0, 0), (-1, -1), 0, ORANGE),
                ]
            ),
        )
        rows.append([number, Paragraph(item, styles["StepBody"])])
    table = Table(rows, colWidths=[10 * mm, 163 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("LEFTPADDING", (0, 0), (0, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, -1), 3),
                ("LEFTPADDING", (1, 0), (1, -1), 3),
                ("RIGHTPADDING", (1, 0), (1, -1), 0),
            ]
        )
    )
    return table


def callout(title, body, tone="info"):
    palette = {
        "info": (TEAL_PALE, TEAL),
        "warning": (AMBER_PALE, AMBER),
        "danger": (RED_PALE, RED),
        "tip": (ORANGE_PALE, ORANGE_DARK),
    }
    background, accent = palette[tone]
    table = Table(
        [["", [Paragraph(title, styles["CalloutTitle"]), Paragraph(body, styles["CalloutBody"])]]],
        colWidths=[3 * mm, 170 * mm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BACKGROUND", (0, 0), (0, 0), accent),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 9),
                ("RIGHTPADDING", (1, 0), (1, 0), 9),
                ("TOPPADDING", (1, 0), (1, 0), 8),
                ("BOTTOMPADDING", (1, 0), (1, 0), 8),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.Color(accent.red, accent.green, accent.blue, alpha=0.25)),
            ]
        )
    )
    return KeepTogether([Spacer(1, 5), table, Spacer(1, 7)])


def cards(items, columns=3):
    cells = []
    for title, body in items:
        cells.append(
            [
                Paragraph(title, styles["CardTitle"]),
                Paragraph(body, styles["CardBody"]),
            ]
        )
    rows = []
    for start in range(0, len(cells), columns):
        row = cells[start : start + columns]
        while len(row) < columns:
            row.append([Paragraph("", styles["CardTitle"]), Paragraph("", styles["CardBody"])])
        rows.append(row)
    width = 173 * mm / columns
    table = Table(rows, colWidths=[width] * columns, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, WHITE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def role_table():
    data = [
        ["Área", "Proprietário", "Gerente", "Operador"],
        ["Vendas e consultas", "Completo", "Completo", "Vender e consultar"],
        ["Cadastros e estoque", "Gerenciar", "Gerenciar", "Somente leitura"],
        ["Compras", "Gerenciar", "Gerenciar", "Somente leitura"],
        ["Financeiro e caixa", "Gerenciar", "Gerenciar", "Somente leitura"],
        ["Relatórios", "Acesso", "Acesso", "Sem acesso"],
        ["Auditoria", "Acesso", "Acesso", "Sem acesso"],
        ["Equipe e exclusões", "Gerenciar", "Sem acesso", "Sem acesso"],
    ]
    formatted = []
    for row_index, row in enumerate(data):
        style = "TableHeader" if row_index == 0 else "CardBody"
        formatted.append([Paragraph(escape(value), styles[style]) for value in row])
    table = Table(formatted, colWidths=[57 * mm, 39 * mm, 39 * mm, 39 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("BACKGROUND", (0, 1), (-1, -1), WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(ORANGE)
    canvas.circle(PAGE_W - 24 * mm, PAGE_H - 23 * mm, 50 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#FF7448"))
    canvas.circle(PAGE_W - 5 * mm, PAGE_H - 57 * mm, 27 * mm, stroke=0, fill=1)
    canvas.setStrokeColor(colors.Color(1, 1, 1, alpha=0.15))
    canvas.setLineWidth(1)
    for offset in range(0, 7):
        y = 35 * mm + offset * 16 * mm
        canvas.line(22 * mm, y, PAGE_W - 22 * mm, y)

    x, y = 24 * mm, PAGE_H - 37 * mm
    canvas.setFillColor(ORANGE)
    canvas.roundRect(x, y, 18 * mm, 18 * mm, 4 * mm, stroke=0, fill=1)
    canvas.setStrokeColor(WHITE)
    canvas.setLineWidth(2.1)
    canvas.roundRect(x + 5 * mm, y + 4 * mm, 8 * mm, 10 * mm, 1.5 * mm, stroke=1, fill=0)
    canvas.line(x + 6 * mm, y + 12 * mm, x + 12 * mm, y + 12 * mm)
    canvas.setFont(FONT_BOLD, 22)
    canvas.setFillColor(WHITE)
    canvas.drawString(x + 23 * mm, y + 6.2 * mm, "Santo Gole")
    canvas.setFont(FONT_BOLD, 7.2)
    canvas.setFillColor(colors.HexColor("#BFCBD6"))
    canvas.drawString(x + 23.2 * mm, y + 2.1 * mm, "GESTÃO DE BEBIDAS")

    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 31)
    canvas.drawString(24 * mm, 155 * mm, "Manual de uso")
    canvas.setFont(FONT_BOLD, 31)
    canvas.drawString(24 * mm, 142 * mm, "do sistema")
    canvas.setFont(FONT, 13)
    canvas.setFillColor(colors.HexColor("#D9E2EA"))
    canvas.drawString(24 * mm, 129 * mm, "Operação, estoque, compras, financeiro e gestão")
    canvas.drawString(24 * mm, 122 * mm, "da distribuidora em um só lugar.")

    canvas.setFillColor(ORANGE)
    canvas.roundRect(24 * mm, 96 * mm, 54 * mm, 10 * mm, 5 * mm, stroke=0, fill=1)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 8.5)
    canvas.drawCentredString(51 * mm, 99.6 * mm, "GUIA DO USUÁRIO")

    canvas.setFillColor(colors.HexColor("#BFCBD6"))
    canvas.setFont(FONT, 9)
    canvas.drawString(24 * mm, 28 * mm, "Versão 1.0 | 25 de outubro de 2026")
    canvas.drawRightString(PAGE_W - 24 * mm, 28 * mm, "Santo Gole")
    canvas.restoreState()


def content_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(WHITE)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 15 * mm, PAGE_W, 15 * mm, stroke=0, fill=1)
    canvas.setFillColor(ORANGE)
    canvas.rect(0, PAGE_H - 15 * mm, 4 * mm, 15 * mm, stroke=0, fill=1)
    canvas.setFont(FONT_BOLD, 9)
    canvas.setFillColor(WHITE)
    canvas.drawString(16 * mm, PAGE_H - 9.5 * mm, "SANTO GOLE")
    canvas.setFont(FONT, 8)
    canvas.setFillColor(colors.HexColor("#CBD5DF"))
    canvas.drawRightString(PAGE_W - 16 * mm, PAGE_H - 9.5 * mm, "Manual de uso")

    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(16 * mm, 15 * mm, PAGE_W - 16 * mm, 15 * mm)
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(16 * mm, 9.5 * mm, "Santo Gole | Gestão de bebidas")
    canvas.drawRightString(PAGE_W - 16 * mm, 9.5 * mm, f"Página {doc.page}")
    canvas.restoreState()


doc = ManualDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=24 * mm,
    bottomMargin=20 * mm,
    title="Manual de uso - Santo Gole",
    author="Santo Gole",
    subject="Guia de utilização do sistema de gestão da distribuidora",
)

cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
content_frame = Frame(
    18 * mm,
    20 * mm,
    PAGE_W - 36 * mm,
    PAGE_H - 44 * mm,
    id="content",
    leftPadding=0,
    rightPadding=0,
    topPadding=0,
    bottomPadding=0,
)
doc.addPageTemplates(
    [
        PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="Content", frames=[content_frame], onPage=content_page),
    ]
)

story = []
story.extend([Spacer(1, 1), NextPageTemplate("Content"), PageBreak()])

toc = TableOfContents()
toc.levelStyles = [styles["TOCLevel0"]]
story.extend(
    [
        Paragraph("Sumário", styles["TOCTitle"]),
        p("Use este índice para localizar rapidamente a área que deseja operar.", "ChapterIntro"),
        toc,
        Spacer(1, 12),
        callout(
            "Sobre este manual",
            "Este documento explica como usar o sistema. Os nomes dos botões e campos seguem a interface atual da Santo Gole; detalhes técnicos e configurações de banco de dados não fazem parte deste guia.",
            "info",
        ),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Primeiros passos", "ChapterTitle"),
        p("Conheça a navegação, os comportamentos automáticos e a sequência recomendada para iniciar a operação.", "ChapterIntro"),
        p("Navegação principal", "SectionHeading"),
        cards(
            [
                ("Barra lateral", "Use as abas para alternar entre operação, gestão e administração. A aba atual fica destacada."),
                ("Ajuda rápida", "O ícone de interrogação apresenta atalhos para registrar venda, cadastrar produto e criar pedido de compra."),
                ("Alertas", "O sino mostra compras atrasadas e produtos com estoque baixo. O contador é atualizado automaticamente."),
                ("Perfil", "No canto superior direito aparecem o nome, o perfil de acesso e a opção de sair do sistema."),
                ("Filtros automáticos", "Seleções em listas são aplicadas na hora. Campos de busca aguardam um pequeno intervalo após a digitação."),
                ("Tempo real", "Alterações feitas por outra pessoa aparecem automaticamente após um breve intervalo, sem recarregar manualmente."),
            ],
            columns=2,
        ),
        p("Rotina recomendada para o dia", "SectionHeading"),
        steps(
            [
                "Acesse <b>Caixa</b> e abra um expediente com o saldo inicial contado.",
                "Confira <b>Estoque</b> e os alertas de reposição antes de começar as vendas.",
                "Registre as operações em <b>Vendas</b>, <b>Compras</b> e <b>Financeiro</b> ao longo do dia.",
                "Revise os indicadores em <b>Visão geral</b> e <b>Relatórios</b>.",
                "Ao encerrar o turno, conte o dinheiro e faça o fechamento na aba <b>Caixa</b>.",
            ]
        ),
        callout(
            "Regra central do caixa",
            "Nenhuma venda pode ser concluída com o caixa fechado. Pagamentos, recebimentos e estornos em dinheiro também exigem um expediente aberto.",
            "warning",
        ),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Visão geral", "ChapterTitle"),
        p("É o painel inicial para acompanhar rapidamente a situação da distribuidora e acessar as tarefas mais frequentes.", "ChapterIntro"),
        p("O que você encontra", "SectionHeading"),
        cards(
            [
                ("Vendas de hoje", "Valor vendido e quantidade de vendas concluídas no dia."),
                ("Itens vendidos", "Total de unidades baixadas do estoque pelas vendas do dia."),
                ("Lucro bruto", "Vendas menos o custo registrado nos itens vendidos."),
                ("Vendas recentes", "Resumo das últimas movimentações comerciais."),
                ("Estoque em alerta", "Produtos que atingiram ou ficaram abaixo do estoque mínimo."),
                ("Atalhos", "Acesso direto às operações mais comuns do sistema."),
            ]
        ),
        p("Como usar", "SectionHeading"),
        steps(
            [
                "Leia os cartões superiores para entender o ritmo do dia.",
                "Confira <b>Vendas recentes</b> para identificar as últimas operações registradas.",
                "Observe <b>Estoque em alerta</b> e use o link para abrir a aba Estoque quando houver itens críticos.",
                "Use os atalhos inferiores para iniciar venda, cadastrar produto ou registrar compra, conforme sua permissão.",
            ]
        ),
        callout("Dica", "Use a Visão geral como tela de acompanhamento. Para consultar períodos maiores ou analisar formas de pagamento, abra Relatórios.", "tip"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Vendas", "ChapterTitle"),
        p("Registra pedidos, baixa o estoque, grava o pagamento e apresenta o histórico detalhado das vendas.", "ChapterIntro"),
        p("Registrar uma nova venda", "SectionHeading"),
        steps(
            [
                "Confirme que existe um <b>caixa aberto</b>. Caso esteja fechado, use o botão <b>Abrir caixa</b> ou solicite a um proprietário/gerente.",
                "Clique em <b>Nova venda</b>.",
                "Selecione o cliente ou mantenha <b>Consumidor final</b>.",
                "Escolha o local de estoque e a forma de pagamento.",
                "Adicione os produtos e informe quantidades inteiras. O sistema verifica o saldo disponível no local escolhido.",
                "Se necessário, informe desconto e observações. Confira subtotal e total antes de clicar em <b>Concluir venda</b>.",
            ]
        ),
        p("Consultar, cancelar ou devolver", "SectionHeading"),
        bullets(
            [
                "A lista padrão exibe as vendas de ontem e hoje; use Todas as vendas para consultar o histórico completo.",
                "Clique em uma linha para abrir cliente, itens, pagamento, totais e observações.",
                "Proprietários e gerentes podem cancelar a venda inteira ou registrar uma devolução parcial.",
                "Cancelamentos e devoluções repõem o estoque e registram o estorno financeiro.",
                "Se a venda foi paga em dinheiro, o caixa precisa estar aberto e possuir saldo suficiente para o estorno.",
            ]
        ),
        callout("Atenção", "Ao concluir uma venda, estoque, financeiro, caixa e relatórios são atualizados de forma integrada. Revise produto, quantidade e forma de pagamento antes de confirmar.", "danger"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Produtos", "ChapterTitle"),
        p("Mantém o catálogo de bebidas, preços, identificação comercial e parâmetros de estoque.", "ChapterIntro"),
        p("Cadastrar um produto", "SectionHeading"),
        steps(
            [
                "Clique em <b>Novo produto</b> e informe o nome obrigatório.",
                "Escolha uma categoria e preencha marca, SKU, código de barras e descrição quando forem úteis.",
                "Defina a unidade de controle, como UN, CX, FD, LT ou KG.",
                "Informe custo, preço de venda e estoque mínimo.",
                "Para já iniciar com saldo, escolha o local de estoque e informe uma quantidade inicial inteira.",
                "Marque se o produto está ativo e se possui embalagem retornável; depois salve.",
            ]
        ),
        p("Editar e consultar", "SectionHeading"),
        bullets(
            [
                "Use o lápis na coluna Ações para editar um produto. A página leva automaticamente ao formulário.",
                "Ao escolher outro produto durante uma edição, o formulário troca para o novo item.",
                "A tabela mostra categoria, SKU, estoque, unidade, status e preço.",
                "A paginação mantém a lista leve quando o catálogo cresce.",
            ]
        ),
        callout("Para que serve o SKU?", "O SKU é um código interno que facilita busca, conferência e padronização do catálogo. Ele é especialmente útil quando há produtos parecidos em tamanhos ou embalagens diferentes.", "info"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Estoque", "ChapterTitle"),
        p("Mostra saldos por produto e local, alerta necessidades de reposição e registra ajustes com rastreabilidade.", "ChapterIntro"),
        p("Consultar os saldos", "SectionHeading"),
        steps(
            [
                "Use <b>Buscar produto</b> para localizar por nome e selecione um local quando quiser restringir a consulta.",
                "Observe os indicadores de estoque disponível, baixo e zerado.",
                "Na tabela, compare saldo atual e estoque mínimo. Produtos em alerta ficam destacados.",
                "Consulte <b>Movimentações recentes</b> para entender entradas, saídas, vendas, recebimentos e ajustes.",
            ]
        ),
        p("Ajustar o estoque", "SectionHeading"),
        steps(
            [
                "Clique em <b>Ajustar estoque</b> ou no lápis da linha desejada.",
                "Confirme produto e local. O saldo atual será exibido para referência.",
                "Informe o <b>novo saldo</b> em unidades inteiras e descreva o motivo, por exemplo contagem física, perda ou correção.",
                "Salve o ajuste. O sistema cria uma movimentação com a diferença entre o saldo anterior e o novo.",
            ]
        ),
        callout("Boa prática", "Não use ajuste para registrar uma compra ou venda. Use Compras e Vendas para manter a origem da movimentação corretamente identificada.", "tip"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Clientes", "ChapterTitle"),
        p("Organiza os contatos usados nas vendas e preserva o histórico mesmo quando um cliente deixa de comprar.", "ChapterIntro"),
        p("Cadastrar ou editar", "SectionHeading"),
        steps(
            [
                "Clique em <b>Novo cliente</b> e informe o nome.",
                "Preencha telefone, e-mail, documento e observações quando disponíveis.",
                "Mantenha o cliente ativo para que apareça na seleção de novas vendas.",
                "Para alterar informações, clique no lápis da linha, edite e salve.",
            ]
        ),
        p("Localizar clientes", "SectionHeading"),
        bullets(
            [
                "A busca aceita nome, telefone, e-mail ou documento.",
                "O filtro de status separa ativos e inativos e é aplicado automaticamente.",
                "Clientes inativos permanecem vinculados ao histórico das vendas antigas.",
                "A lista exibe 10 registros por página.",
            ]
        ),
        callout("Quando vale a pena cadastrar?", "Cadastre clientes recorrentes, empresas e pontos de venda. Para compras ocasionais, use Consumidor final ao registrar a venda.", "info"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Fornecedores", "ChapterTitle"),
        p("Centraliza os dados de quem fornece bebidas e permite vincular cada pedido de compra à sua origem.", "ChapterIntro"),
        p("Cadastrar ou editar", "SectionHeading"),
        steps(
            [
                "Clique em <b>Novo fornecedor</b>.",
                "Informe razão/nome, documento, telefone, e-mail e pessoa de contato conforme disponível.",
                "Use observações para registrar prazos, dias de entrega, condições comerciais ou instruções.",
                "Mantenha o fornecedor ativo para selecioná-lo em novos pedidos de compra.",
                "Use o lápis da tabela para atualizar os dados posteriormente.",
            ]
        ),
        p("Consulta", "SectionHeading"),
        bullets(
            [
                "Pesquise pelo conteúdo cadastrado e combine com o filtro de status.",
                "Os filtros são automáticos e a listagem possui paginação de 10 registros.",
                "Inativar é preferível a apagar quando o fornecedor já possui histórico de compras.",
            ]
        ),
        callout("Importante", "Somente fornecedores ativos aparecem no formulário de novo pedido de compra.", "warning"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Compras", "ChapterTitle"),
        p("Cria pedidos aos fornecedores e acompanha recebimentos completos ou parciais, mantendo a ligação com o pedido original.", "ChapterIntro"),
        p("Criar um pedido", "SectionHeading"),
        steps(
            [
                "Clique em <b>Novo pedido</b> e escolha um fornecedor ativo.",
                "Informe referência/documento, data da solicitação e previsão de entrega.",
                "Adicione produtos, quantidades inteiras e custo unitário.",
                "Informe desconto, frete, outros custos e observações quando existirem.",
                "Revise o total e salve o pedido.",
            ]
        ),
        p("Receber mercadorias", "SectionHeading"),
        steps(
            [
                "Clique na linha do pedido para abrir os detalhes.",
                "Na área <b>Registrar recebimento</b>, escolha o local de estoque e a data real do recebimento.",
                "Informe quanto chegou de cada item. É possível receber apenas parte do pedido.",
                "Confirme. O estoque e o custo são atualizados, e o recebimento fica registrado dentro do pedido.",
                "Repita o processo em outra data até concluir todos os itens restantes.",
            ]
        ),
        callout("Pedido atrasado", "Pedidos ainda aguardando itens após a previsão recebem um aviso de atraso. Use os filtros de status para priorizar o acompanhamento.", "warning"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Financeiro", "ChapterTitle"),
        p("Acompanha contas a receber, contas a pagar, pagamentos parciais e lançamentos manuais.", "ChapterIntro"),
        p("Entender os indicadores", "SectionHeading"),
        cards(
            [
                ("Resultado no mês", "Entradas efetivamente recebidas menos saídas efetivamente pagas."),
                ("A receber", "Saldo das receitas pendentes ou parcialmente recebidas."),
                ("A pagar", "Saldo das despesas pendentes, com destaque para vencimentos atrasados."),
            ]
        ),
        p("Criar lançamento", "SectionHeading"),
        steps(
            [
                "Clique em <b>Novo lançamento</b> e escolha Receita ou Despesa.",
                "Informe descrição, valor, emissão, vencimento, categoria e cliente/fornecedor quando aplicável.",
                "Se o valor já foi quitado, marque a opção correspondente e selecione a forma de pagamento.",
                "Salve. Caso seja em dinheiro, o caixa precisa estar aberto.",
            ]
        ),
        p("Registrar pagamento ou recebimento", "SectionHeading"),
        steps(
            [
                "Clique na linha do lançamento para abrir os detalhes.",
                "Informe valor, data, forma, referência e observação.",
                "Confirme. Pagamentos parciais mantêm o saldo restante em aberto.",
            ]
        ),
        callout("Caixa e dinheiro", "Com o caixa fechado, ainda é possível criar lançamentos pendentes e registrar Pix, cartão, boleto ou transferência. Somente movimentações em dinheiro ficam bloqueadas.", "info"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Caixa", "ChapterTitle"),
        p("Controla o expediente financeiro, o dinheiro esperado, movimentações manuais e a conferência no fechamento.", "ChapterIntro"),
        p("Abrir o expediente", "SectionHeading"),
        steps(
            [
                "Na primeira utilização, crie um caixa e, opcionalmente, vincule-o a um local de estoque.",
                "Escolha o caixa, informe o saldo inicial contado e clique em <b>Abrir caixa</b>.",
                "Após a abertura, vendas e movimentações em dinheiro passam a ser registradas automaticamente.",
            ]
        ),
        p("Durante o expediente", "SectionHeading"),
        bullets(
            [
                "Entrada avulsa: dinheiro recebido sem vínculo com venda.",
                "Suprimento: reforço de numerário colocado no caixa.",
                "Saída avulsa: retirada para uma despesa não categorizada em outro fluxo.",
                "Sangria: retirada de excesso de dinheiro para segurança.",
                "O saldo esperado considera abertura, entradas e saídas registradas.",
            ]
        ),
        p("Fechar o caixa", "SectionHeading"),
        steps(
            [
                "Conte o dinheiro físico e informe o saldo contado.",
                "Confira a diferença entre esperado e contado e registre uma justificativa quando necessário.",
                "Clique em <b>Fechar caixa</b>. O fechamento fica preservado no histórico.",
            ]
        ),
        callout("Efeito do fechamento", "Com o caixa fechado, novas vendas e operações em dinheiro ficam bloqueadas. Para continuar operando, abra um novo expediente.", "danger"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Relatórios", "ChapterTitle"),
        p("Consolida vendas, margem, fluxo financeiro, compras, produtos e estoque para apoiar decisões.", "ChapterIntro"),
        p("Escolher o período", "SectionHeading"),
        steps(
            [
                "Use o campo <b>Período</b> e escolha Hoje, Últimos 7 dias, Últimos 30 dias ou Este mês.",
                "Para outro intervalo, selecione <b>Personalizado</b> e informe data inicial e final.",
                "O relatório é atualizado automaticamente após a seleção. A data final não pode ser menor que a inicial.",
            ]
        ),
        p("O que analisar", "SectionHeading"),
        cards(
            [
                ("Faturamento", "Total líquido das vendas concluídas no período."),
                ("Lucro e margem", "Receita menos custos registrados nos itens."),
                ("Ticket médio", "Valor médio por venda concluída."),
                ("Evolução", "Distribuição das vendas ao longo dos dias."),
                ("Fluxo financeiro", "Entradas, saídas e saldo do período."),
                ("Ranking", "Produtos mais vendidos e formas de pagamento."),
                ("Compras", "Valores e unidades recebidos no período."),
                ("Estoque crítico", "Produtos no estoque mínimo ou abaixo dele."),
            ],
            columns=2,
        ),
        callout("Exportar CSV", "Use Exportar CSV para abrir os dados em uma planilha, compartilhar com a contabilidade ou fazer análises adicionais.", "tip"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Auditoria", "ChapterTitle"),
        p("Apresenta o histórico imutável das operações importantes e permite identificar quem alterou cada registro.", "ChapterIntro"),
        p("Quem pode acessar", "SectionHeading"),
        p("A aba está disponível para <b>Proprietários</b> e <b>Gerentes</b>. Operadores não têm acesso ao histórico de auditoria."),
        p("Como consultar", "SectionHeading"),
        steps(
            [
                "Use a busca para localizar registro, ação ou tabela.",
                "Combine os filtros de módulo, ação, responsável e intervalo de datas.",
                "Clique em uma linha para abrir os detalhes.",
                "Na seção <b>Antes e depois</b>, compare os valores anteriores e posteriores já traduzidos para português.",
            ]
        ),
        p("Eventos em destaque", "SectionHeading"),
        bullets(
            [
                "Criações e atualizações de cadastros.",
                "Recebimentos de compras e ajustes de estoque.",
                "Aberturas, movimentações e fechamentos de caixa.",
                "Cancelamentos, devoluções e exclusões.",
                "Mudanças de informações e perfis da equipe.",
            ]
        ),
        callout("Uso recomendado", "Consulte a auditoria quando houver divergência de estoque, diferença de caixa ou dúvida sobre quem modificou uma informação.", "info"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Equipe", "ChapterTitle"),
        p("Área exclusiva do proprietário para criar contas, atualizar dados, alterar perfis e remover acessos.", "ChapterIntro"),
        p("Criar um usuário", "SectionHeading"),
        steps(
            [
                "No formulário <b>Criar usuário</b>, informe nome completo, e-mail, telefone, perfil e senha temporária.",
                "O nome é obrigatório e a senha deve ter pelo menos 8 caracteres.",
                "Clique em <b>Criar acesso</b>. A conta é criada no Auth e aparece automaticamente na lista da organização.",
                "Envie as credenciais temporárias à pessoa por um meio seguro.",
            ]
        ),
        p("Gerenciar membros", "SectionHeading"),
        bullets(
            [
                "Use o seletor de perfil para trocar entre Proprietário, Gerente e Operador.",
                "Clique no lápis para editar nome, e-mail, telefone e perfil, inclusive os seus próprios dados.",
                "Enquanto uma atualização estiver em andamento, os campos ficam bloqueados e o sistema mostra feedback.",
                "A exclusão remove a conta do Supabase Auth, o perfil e o vínculo com a organização.",
                "O proprietário não pode excluir o próprio acesso pela lista.",
            ]
        ),
        callout("Cuidado ao conceder Proprietário", "Esse perfil possui acesso completo, inclusive à gestão da equipe e às exclusões. Conceda-o somente a pessoas responsáveis pela administração do negócio.", "danger"),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Perfis de acesso", "ChapterTitle"),
        p("As permissões controlam quais abas e ações cada pessoa pode utilizar.", "ChapterIntro"),
        role_table(),
        Spacer(1, 12),
        callout("Proprietário", "Acesso completo à operação, relatórios, auditoria, equipe e exclusões.", "tip"),
        callout("Gerente", "Opera vendas, cadastros, estoque, compras, financeiro, caixa e relatórios. Não gerencia a equipe nem exclui registros.", "info"),
        callout("Operador", "Registra vendas e consulta dados operacionais. Não altera cadastros, estoque, compras, financeiro ou caixa.", "warning"),
        p("Quando uma opção não aparecer", "SectionHeading"),
        p("Isso normalmente significa que o perfil atual não possui permissão para aquela ação. Se a atividade fizer parte da função da pessoa, solicite ao proprietário a revisão do perfil na aba Equipe."),
        PageBreak(),
    ]
)

story.extend(
    [
        p("Referência rápida", "ChapterTitle"),
        p("Respostas para situações frequentes durante o uso diário.", "ChapterIntro"),
        p("Não consigo registrar uma venda", "SectionHeading"),
        bullets(
            [
                "Verifique se o caixa está aberto.",
                "Confirme se existe local de estoque ativo e produto com saldo suficiente.",
                "Use quantidades inteiras e não repita o mesmo produto na venda.",
            ]
        ),
        p("Não consigo pagar ou receber em dinheiro", "SectionHeading"),
        bullets(
            [
                "Abra um caixa antes da operação.",
                "Para uma saída ou estorno, confira se o saldo esperado é suficiente.",
                "Se o caixa deve permanecer fechado, escolha outra forma de pagamento quando a operação permitir.",
            ]
        ),
        p("Os dados demoraram a aparecer", "SectionHeading"),
        bullets(
            [
                "A atualização em tempo real pode levar um breve intervalo.",
                "Troque de aba e retorne ou atualize a página se a conexão ficou inativa por muito tempo.",
                "Confirme que está usando a mesma organização e os filtros corretos.",
            ]
        ),
        p("Boas práticas", "SectionHeading"),
        bullets(
            [
                "Abra e feche o caixa em cada expediente.",
                "Registre compras pelo pedido e recebimento, evitando ajustes manuais de estoque.",
                "Mantenha custos e estoque mínimo dos produtos atualizados.",
                "Use observações e referências para facilitar conferências futuras.",
                "Revise periodicamente Relatórios e Auditoria.",
            ]
        ),
        callout("Fim do guia", "Este manual acompanha a versão atual da Santo Gole. Caso uma tela receba novas funções, atualize também este documento para manter a equipe alinhada.", "info"),
    ]
)

doc.multiBuild(story)
print(OUTPUT)
