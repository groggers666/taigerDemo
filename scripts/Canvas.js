function viewDataPoint(dataPoint, pg) {	
	switch(pg) {
		  case '1':
			showDoc('1');
			break;
		  case '14':
			showDoc('14');
			break;
		  case '5':
			showDoc('5');
			break;
		  case '6':
			showDoc('6');
			break;	
		  case '13':
			showDoc('13');
			break;	
		  default:
			// code block
		}

  setTimeout(function () {
    var canvas = document.getElementById('theCanvas');
    var ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
	  switch(dataPoint) {
		  case 'comName':
			ctx.rect(125, 285, 300, 25);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'rekening':
			ctx.rect(890, 315, 140, 25);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'alamat':
			ctx.rect(125, 305, 300, 110);
			document.getElementById("detailsBox9").style.display = "none";
			document.getElementById("detailsBox6").style.display = "block";
			break;
		  case 'periode':
			ctx.rect(890, 370, 240, 25);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'sawal':
			ctx.rect(475, 955, 380, 25);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'mcr':
			ctx.rect(475, 975, 380, 25);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'sakhir':
			ctx.rect(475, 1015, 380, 25);
			document.getElementById("detailsBox9").style.display = "none";
			document.getElementById("detailsBox6").style.display = "block";
			break;
		  case 'mdb':
			ctx.rect(475, 995, 380, 25);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'k1':
			ctx.rect(125, 740, 1100, 85);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'k2':
			ctx.rect(125, 860, 1100, 85);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
	      case 'k3':
			ctx.rect(125, 1490, 1100, 85);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'k4':
			ctx.rect(115, 820, 1100, 85);
			document.getElementById("detailsBox9").style.display = "block";
			document.getElementById("detailsBox6").style.display = "none";
			break;
		  case 'k5':
			ctx.rect(115, 1400, 1100, 85);
			document.getElementById("detailsBox9").style.display = "none";
			document.getElementById("detailsBox6").style.display = "block";
			break;
		  case 'k6':
			ctx.rect(115, 1480, 1100, 85);
			document.getElementById("detailsBox9").style.display = "none";
			document.getElementById("detailsBox6").style.display = "block";
			break;
		  default:
			// code block
		}
	
    ctx.fill();
    ctx.stroke();

  }, 200);

}

function showDoc(pgNo) {
  var canvas = document.getElementById('theCanvas');
  var ctx = canvas.getContext('2d');

  var img = new Image();

  img.onload = function () {
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0);
  }

  //img.src = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/130527/yellow-flower.jpg';
  
  
  switch(pgNo) {
		  case '1':
			img.src = 'SampleFiles/Pics/SampleDoc_pg1.jpg';
			break;
		  case '14':
			img.src = 'SampleFiles/Pics/SampleDoc_pg14.jpg';
			break;
		  case '5':
			img.src = 'SampleFiles/Pics/SampleDoc_pg5.jpg';
			break;
		  case '6':
			img.src = 'SampleFiles/Pics/SampleDoc_pg6.jpg';
			break;
		  case '13':
			img.src = 'SampleFiles/Pics/SampleDoc_pg13.jpg';
			break;
		  default:
			// code block
		}
  

}
